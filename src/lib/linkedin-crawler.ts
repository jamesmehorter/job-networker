import { chromium, Browser, Page } from 'playwright';
import { LinkedInCredentials, Connection, Company, CrawlSettings } from '@/types';
import { getDatabase } from './database';

interface CrawlProgress {
  onProgress: (progress: number, message: string) => void;
}

export class LinkedInCrawler {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private db = getDatabase();
  private settings: CrawlSettings;

  constructor(settings: CrawlSettings) {
    this.settings = settings;
  }

  async initialize(): Promise<void> {
    this.browser = await chromium.launch({ 
      headless: this.settings.headless,
      timeout: 60000 
    });
    
    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 }
    });
    
    this.page = await context.newPage();
    
    // Set reasonable timeouts
    this.page.setDefaultTimeout(30000);
    this.page.setDefaultNavigationTimeout(30000);
  }

  async login(credentials: LinkedInCredentials): Promise<boolean> {
    if (!this.page) throw new Error('Crawler not initialized');

    try {
      console.log('Navigating to LinkedIn login page...');
      await this.page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' });
      await this.wait(2000);

      // Wait for login form to be visible
      await this.page.waitForSelector('#username', { timeout: 10000 });
      await this.page.waitForSelector('#password', { timeout: 10000 });

      console.log('Filling login credentials...');
      // Fill login form
      await this.page.fill('#username', credentials.email);
      await this.page.fill('#password', credentials.password);
      
      // Click login button and wait for navigation
      console.log('Clicking login button...');
      await Promise.all([
        this.page.waitForNavigation({ timeout: 20000 }),
        this.page.click('button[type="submit"]')
      ]);
      
      // Additional wait for page to stabilize
      await this.wait(3000);
      
      // Check for various possible outcomes
      const currentUrl = this.page.url();
      console.log('Current URL after login attempt:', currentUrl);
      
      if (currentUrl.includes('/challenge')) {
        throw new Error('LinkedIn security challenge required. Please login manually first.');
      }
      
      if (currentUrl.includes('/login') || currentUrl.includes('/uas/login')) {
        throw new Error('Login failed. Please check your credentials.');
      }
      
      // Check if we're on the feed or any LinkedIn authenticated page
      if (currentUrl.includes('linkedin.com/feed') || 
          currentUrl.includes('linkedin.com/in/')) {
        console.log('Login successful!');
        return true;
      }
      
      // Check for navigation header as fallback
      const navExists = await this.page.locator('nav[aria-label="Primary Navigation"]').count() > 0;
      if (navExists) {
        console.log('Login successful (detected nav)!');
        return true;
      }
      
      throw new Error(`Login status unclear. Current URL: ${currentUrl}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Login error details:', errorMessage);
      throw new Error(`Login failed: ${errorMessage}`);
    }
  }

  async crawlFirstDegreeConnections(
    sessionId: string, 
    progressCallback: CrawlProgress['onProgress']
  ): Promise<void> {
    if (!this.page) throw new Error('Crawler not initialized');

    console.log('=== Starting First Degree Connections Crawl ===');
    progressCallback(0, 'Starting first degree connections crawl...');

    try {
      // Navigate to the companies search page with first-degree network filter
      const searchUrl = 'https://www.linkedin.com/search/results/companies/?network=%5B%22F%22%5D&origin=FACETED_SEARCH';
      console.log('Navigating to:', searchUrl);
      
      await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
      await this.wait(5000); // Increased wait time

      console.log('Current URL after navigation:', this.page.url());
      progressCallback(10, 'Loading company results...');

      // Check if we're on the right page or if LinkedIn redirected us
      const currentUrl = this.page.url();
      if (!currentUrl.includes('/search/results/companies')) {
        console.warn('LinkedIn may have redirected us. Current URL:', currentUrl);
        
        // Try alternative approach - go to companies tab manually
        console.log('Trying alternative navigation...');
        await this.page.goto('https://www.linkedin.com/search/results/all/?keywords=*&origin=GLOBAL_SEARCH_HEADER');
        await this.wait(3000);
        
        // Look for companies filter/tab
        try {
          await this.page.click('button[aria-label*="Companies"], a[href*="companies"]');
          await this.wait(3000);
        } catch (filterError) {
          console.warn('Could not find companies filter:', filterError);
        }
      }

      // Scroll to load more results
      console.log('Scrolling to load more results...');
      await this.scrollToLoadResults();
      
      progressCallback(30, 'Extracting company data...');

      // Extract company information
      console.log('Starting company extraction...');
      const companies = await this.extractCompaniesFromSearch();
      
      console.log(`=== Extraction Complete: Found ${companies.length} companies ===`);
      progressCallback(60, `Found ${companies.length} companies. Processing connections...`);

      if (companies.length === 0) {
        console.warn('No companies found! This might indicate:');
        console.warn('1. LinkedIn changed their UI/selectors');
        console.warn('2. You have no 1st degree connections at companies');
        console.warn('3. LinkedIn is blocking the search');
        console.warn('4. You need to adjust search filters manually');
      }

      // Process each company and its connections
      let processedCount = 0;
      for (const company of companies) {
        console.log(`Processing company ${processedCount + 1}/${companies.length}: ${company.name}`);
        
        // First, process any connection summary links to get actual individual profiles
        const processedCompany = await this.processConnectionSummaryLinks(company);
        
        // Then process the company connections as usual
        await this.processCompanyConnections(sessionId, processedCompany);
        processedCount++;
        
        const progress = 60 + (processedCount / Math.max(companies.length, 1)) * 35;
        progressCallback(progress, `Processed ${processedCount}/${companies.length} companies`);
        
        if (processedCount < companies.length) {
          await this.wait(this.settings.rateLimit);
        }
      }

      console.log('=== Crawl Complete ===');
      progressCallback(100, `Completed! Found connections at ${companies.length} companies.`);
    } catch (error) {
      console.error('First degree crawl error:', error);
      throw new Error(`First degree crawl failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async crawlFriendsOfFriends(
    sessionId: string, 
    progressCallback: CrawlProgress['onProgress']
  ): Promise<void> {
    if (!this.page) throw new Error('Crawler not initialized');

    progressCallback(0, 'Starting friends of friends crawl...');

    try {
      // First, get my direct connections
      await this.page.goto('https://www.linkedin.com/mynetwork/invite-connect/connections/');
      await this.wait(3000);

      progressCallback(10, 'Loading your connections...');

      // Scroll to load connections
      await this.scrollToLoadResults();
      
      const firstDegreeConnections = await this.extractDirectConnections();
      
      progressCallback(30, `Found ${firstDegreeConnections.length} direct connections. Analyzing their networks...`);

      // Process each connection to find their network
      let processedCount = 0;
      for (const connection of firstDegreeConnections.slice(0, this.settings.maxConnections || 50)) {
        try {
          await this.analyzeFriendNetwork(sessionId, connection);
          processedCount++;
          
          const progress = 30 + (processedCount / Math.min(firstDegreeConnections.length, 50)) * 65;
          progressCallback(progress, `Analyzed ${processedCount} connections' networks`);
          
          await this.wait(this.settings.rateLimit);
        } catch (error) {
          console.warn(`Failed to analyze connection ${connection.name}:`, error);
        }
      }

      progressCallback(100, `Completed! Analyzed ${processedCount} connections' networks.`);
    } catch (error) {
      throw new Error(`Friends of friends crawl failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async scrollToLoadResults(): Promise<void> {
    if (!this.page) return;

    for (let i = 0; i < 5; i++) {
      await this.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await this.wait(2000);
    }
  }

  private async extractCompaniesFromSearch(): Promise<Array<Company & { connectionInfo: string; connectionNames: Array<{name: string, profileUrl: string, profileImageUrl?: string, isConnectionSummary?: boolean, connectionSource?: string}> }>> {
    if (!this.page) return [];

    // Add debugging to see what's on the page
    console.log('Extracting companies from search results page...');
    console.log('Current URL:', this.page.url());
    
    // Wait for content to load
    await this.wait(5000);

    // First check what's actually on the page from Node.js side
    const pageTitle = await this.page.title();
    const currentUrl = await this.page.url();
    console.log('Page title from Node.js:', pageTitle);
    console.log('Current URL from Node.js:', currentUrl);

    const result = await this.page.evaluate(() => {
      const companies: Array<Company & { connectionInfo: string; connectionNames: Array<{name: string, profileUrl: string, profileImageUrl?: string, isConnectionSummary?: boolean, connectionSource?: string}> }> = [];
      const debugInfo = {
        usedSelector: '',
        selectorResults: [] as Array<{ selector: string; count: number }>,
        pageTitle: document.title,
        cardDebugInfo: [] as Array<{ cardIndex: number; htmlSample: string; strategies: string; finalResult: string; connectionDebug?: { connectionInfo: string; connectionNamesFound: number; connectionNames: string[]; connectionLinks: string[] } }>
      };
      
      // Try multiple selector strategies as LinkedIn changes their HTML frequently
      const possibleSelectors = [
        '[data-test-result-container]', // Original selector
        '.reusable-search__result-container', // Alternative selector
        '.search-result__wrapper', // Another common pattern
        '.entity-result', // Generic entity result
        '[data-chameleon-result-urn]', // URN-based results
        'li[data-row]', // List items with data-row
        '.search-results li', // Simple list approach
        '.org-company-card', // Company card specific
        '.search-results__list li', // More specific list approach
        '[data-control-name="search_srp_result"]', // Control name based
        '.app-aware-link', // App aware link containers
        'div[data-view-name="search-entity-result"]', // View name based
        '.artdeco-entity-lockup', // Artdeco framework components
        '.org-top-card-primary-content__entities li', // Org card entities
        'li.reusable-search__result-container', // Combined approach
      ];

      // Record results for all selectors
      debugInfo.selectorResults = possibleSelectors.map(s => ({
        selector: s,
        count: document.querySelectorAll(s).length
      }));

      let companyCards: NodeListOf<Element> | null = null;

      // Find the selector that actually returns results
      for (const selector of possibleSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          companyCards = elements;
          debugInfo.usedSelector = selector;
          break;
        }
      }

      if (!companyCards) {
        return { companies, debugInfo };
      }

      companyCards.forEach((card, cardIndex) => {
        try {
          // Try multiple strategies to find company name and link
          let nameElement: Element | null = null;
          let linkElement: HTMLAnchorElement | null = null;
          
          // Debug: Track what we're working with
          const cardHTML = card.outerHTML.substring(0, 200);
          let strategyLog = '';

          // Strategy 1: Original approach
          nameElement = card.querySelector('a[data-test-app-aware-link] span[aria-hidden="true"]');
          linkElement = card.querySelector('a[data-test-app-aware-link]') as HTMLAnchorElement;
          strategyLog += `S1: ${nameElement ? 'name✓' : 'name✗'} ${linkElement ? 'link✓' : 'link✗'}; `;

          // Strategy 2: More generic approach
          if (!nameElement || !linkElement) {
            const allLinks = Array.from(card.querySelectorAll('a'));
            let s2Found = false;
            for (const link of allLinks) {
              if (link.href?.includes('/company/')) {
                linkElement = link as HTMLAnchorElement;
                
                // Try multiple approaches to find the company name
                const possibleNameElements = [
                  link.querySelector('span[aria-hidden="true"]'),
                  link.querySelector('span:not([aria-hidden="false"])'),
                  link.querySelector('.entity-result__title-text span'),
                  link.querySelector('span'),
                  link.querySelector('*'),
                  link
                ];
                
                for (const elem of possibleNameElements) {
                  const text = elem?.textContent?.trim();
                  if (text && text.length > 0) {
                    nameElement = elem;
                    break;
                  }
                }
                
                s2Found = true;
                break;
              }
            }
            strategyLog += `S2: ${s2Found ? 'found' : 'not-found'}; `;
          }

          // Strategy 3: Look for any link with company-like text
          if (!nameElement || !linkElement) {
            const headings = Array.from(card.querySelectorAll('h3, h4, .entity-result__title-text, [data-test-result-title]'));
            for (const heading of headings) {
              const link = heading.querySelector('a') || (heading as HTMLAnchorElement);
              if (link?.href) {
                linkElement = link as HTMLAnchorElement;
                nameElement = heading;
                break;
              }
            }
          }

          // Strategy 4: Specific handling for [data-chameleon-result-urn] cards
          if (!nameElement || !linkElement) {
            // Look for any anchor tag within the chameleon result
            const allAnchors = Array.from(card.querySelectorAll('a'));
            for (const anchor of allAnchors) {
              if (anchor.href?.includes('/company/') || anchor.href?.includes('/school/')) {
                linkElement = anchor as HTMLAnchorElement;
                // Try to find the company name in various ways
                const possibleNameElements = [
                  anchor.querySelector('span[aria-hidden="true"]'),
                  anchor.querySelector('.entity-result__title-text span'),
                  anchor.querySelector('[data-anonymize="company-name"]'),
                  anchor.querySelector('span'),
                  anchor
                ];
                
                for (const elem of possibleNameElements) {
                  if (elem?.textContent?.trim()) {
                    nameElement = elem;
                    break;
                  }
                }
                break;
              }
            }
          }

          // Strategy 5: Look for company name outside the link but within the card
          if (!nameElement || !linkElement) {
            // Find any company link first
            const companyLink = Array.from(card.querySelectorAll('a[href]')).find(link => 
              (link as HTMLAnchorElement).href?.includes('/company/')) as HTMLAnchorElement;
              
            if (companyLink) {
              linkElement = companyLink;
              
              // Look for company name in various places within the card
              const possibleNameElements = [
                // Look for headings near the link
                card.querySelector('h3'),
                card.querySelector('h4'),
                card.querySelector('[data-test-result-title]'),
                // Look for spans with visible text 
                ...Array.from(card.querySelectorAll('span')).filter(span => {
                  const text = span.textContent?.trim();
                  return text && text.length > 2 && text.length < 100;
                }),
                // Look for the link's direct text content
                companyLink
              ];
              
              for (const elem of possibleNameElements) {
                const text = elem?.textContent?.trim();
                if (text && text.length > 0 && !text.includes('•') && !text.includes('connection')) {
                  nameElement = elem;
                  break;
                }
              }
            }
            strategyLog += `S5: ${linkElement ? 'link-found' : 'no-link'}${nameElement ? '+name' : '+no-name'}; `;
          }
          
          // Strategy 6: Even more generic - find any meaningful link
          if (!nameElement || !linkElement) {
            const allLinks = Array.from(card.querySelectorAll('a[href]')) as HTMLAnchorElement[];
            for (const link of allLinks) {
              const href = link.href;
              if (href && (href.includes('linkedin.com') && !href.includes('/in/') && !href.includes('/posts/'))) {
                linkElement = link;
                nameElement = link.querySelector('*') || link;
                break;
              }
            }
          }

          // Extract basic company info if we found elements
          const name = nameElement?.textContent?.trim() || '';
          const linkedinUrl = linkElement?.href || '';
          
          // Extract other information with fallback selectors  
          const logoElement = card.querySelector('img') as HTMLImageElement;
          const logoUrl = logoElement?.src || '';
          let description = '';
          let connectionInfo = '';
          const connectionNames: Array<{name: string, profileUrl: string, profileImageUrl?: string, isConnectionSummary?: boolean, connectionSource?: string}> = [];
          
          if (nameElement && linkElement) {
            // Try multiple selectors for company description
            const descriptionSelectors = [
              '[data-test-entity-subtitle]',
              '.entity-result__summary', 
              '.search-result__info .subline-level-1',
              '.t-14', // Common LinkedIn text class
              '.t-black--light',
              'p', // Generic paragraph
              '.entity-result__content p'
            ];
            let descriptionElement: Element | null = null;
            for (const selector of descriptionSelectors) {
              descriptionElement = card.querySelector(selector);
              if (descriptionElement?.textContent?.trim() && descriptionElement.textContent.length > 10) {
                break;
              }
            }

            // Try multiple selectors for connection information - look for text like "John Smith works here" or "2 connections work here"
            const connectionSelectors = [
              '[data-test-entity-context]',
              '.entity-result__context', 
              '.search-result__info .subline-level-2',
              '.entity-result__content .t-12',
              '.entity-result__content .t-black--light',
              '.t-12', // Small text often contains connection info
              '.t-black--light',
              'span[aria-hidden="false"]', // Sometimes connection info is in these spans
              '.entity-result__content span:not([aria-hidden="true"])'
            ];
            const allConnectionTexts: string[] = [];
            
            // Collect all potential connection text
            for (const selector of connectionSelectors) {
              const elements = card.querySelectorAll(selector);
              elements.forEach(elem => {
                const text = elem.textContent?.trim();
                if (text && text.length > 5 && (
                  text.includes('connection') || 
                  text.includes('works here') || 
                  text.includes('work here') ||
                  text.includes('hired here') ||
                  text.includes('from your') ||
                  text.includes('people you may know') ||
                  /\d+ (person|people)/.test(text)
                )) {
                  allConnectionTexts.push(text);
                }
              });
            }
            
            // Use the most relevant connection text
            connectionInfo = allConnectionTexts.length > 0 ? allConnectionTexts[0] : '';
            
            // Look for connection summary links that lead to detailed connection pages
            // These are links like "3 people from your school were hired here" or "2 connections work here"
            const connectionSummaryLinks = Array.from(card.querySelectorAll('a[href]')).filter(link => {
              const text = link.textContent?.trim().toLowerCase() || '';
              const href = (link as HTMLAnchorElement).href || '';
              
              // Look for connection summary links - these contain connection counts and lead to people search pages
              return (
                (text.includes('connection') && (text.includes('work') || text.includes('hire'))) ||
                (text.includes('people') && (text.includes('work') || text.includes('hire') || text.includes('from'))) ||
                (/\d+\s+(people|person|connection)/.test(text) && (text.includes('work') || text.includes('hire') || text.includes('from')))
              ) && href.includes('linkedin.com/search/results/people');
            }) as HTMLAnchorElement[];
            
            // Store connection summary links for later processing
            for (const link of connectionSummaryLinks) {
              const connectionText = link.textContent?.trim() || '';
              const connectionUrl = link.href;
              
              // We'll store the connection summary info to process later
              connectionNames.push({
                name: connectionText, // This will be replaced with actual names later
                profileUrl: connectionUrl, // This is the link to the connection search page
                profileImageUrl: undefined,
                isConnectionSummary: true // Flag to indicate this needs further processing
              });
            }
            
            // Try to extract specific names from connection info text
            if (connectionNames.length === 0 && connectionInfo) {
              // Look for specific person names in various patterns
              const namePatterns = [
                // "John Smith works here"
                /^([A-Z][a-z]+ [A-Z][a-z]+)(?: and \d+ others?)? works? here/i,
                // "Jane Doe and 2 others were hired here"  
                /^([A-Z][a-z]+ [A-Z][a-z]+)(?: and \d+ others?)? were hired here/i,
                // "John Smith from your network"
                /^([A-Z][a-z]+ [A-Z][a-z]+) from your/i,
                // Look for names anywhere in the text that match person name patterns
                /([A-Z][a-z]+ [A-Z][a-z]+)(?:\s+(?:and|works|were|from))/i
              ];
              
              for (const pattern of namePatterns) {
                const match = connectionInfo.match(pattern);
                if (match && match[1]) {
                  // Validate the name doesn't look like company or generic text
                  const possibleName = match[1].trim();
                  if (!possibleName.toLowerCase().includes('connection') && 
                      !possibleName.toLowerCase().includes('company') &&
                      !possibleName.toLowerCase().includes('people')) {
                    connectionNames.push({
                      name: possibleName,
                      profileUrl: '',
                      profileImageUrl: undefined,
                      isConnectionSummary: false,
                      connectionSource: undefined
                    });
                    break;
                  }
                }
              }
            }

            description = descriptionElement?.textContent?.trim() || '';
            
            // Clean up duplicate company names and repetitive text in description
            if (description && name) {
              // Remove duplicate company names
              description = description.replace(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i'), '');
              description = description.replace(new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), '');
              
              // Remove duplicate phrases
              const phrases = description.split('•').map(p => p.trim()).filter(p => p.length > 0);
              const uniquePhrases = Array.from(new Set(phrases));
              description = uniquePhrases.join(' • ');
              
              // Clean up extra whitespace
              description = description.replace(/\s+/g, ' ').trim();
              
              // Limit length to avoid overly long descriptions
              if (description.length > 200) {
                description = description.substring(0, 200) + '...';
              }
            }

            const finalResult = nameElement && linkElement 
              ? `SUCCESS: "${name}" -> ${linkedinUrl}`
              : 'FAILED: No valid extraction';
            
            // Add debugging for connection extraction  
            const connectionDebug = {
              connectionInfo,
              connectionNamesFound: connectionNames.length,
              connectionNames: connectionNames.map(c => c.name),
              connectionLinks: connectionNames.map(c => c.profileUrl)
            };
              
            debugInfo.cardDebugInfo.push({
              cardIndex: cardIndex + 1,
              htmlSample: cardHTML,
              strategies: strategyLog,
              finalResult,
              connectionDebug
            });

            // Only add if we have a valid company name and LinkedIn URL
            if (name && name.length > 1 && linkedinUrl && linkedinUrl.includes('linkedin.com/company/')) {
              companies.push({
                id: '',
                name,
                linkedinUrl,
                logoUrl,
                description,
                createdAt: '',
                connectionInfo,
                connectionNames // Add the extracted connection names and profile links
              } as Company & { connectionInfo: string; connectionNames: Array<{name: string, profileUrl: string}> });
            }
          }
        } catch {
          // Silently continue if extraction fails for this card
        }
      });

      return { companies, debugInfo };
    });

    console.log(`\n=== EXTRACTION RESULTS ===`);
    console.log(`Page title: ${result.debugInfo.pageTitle}`);
    console.log(`Selector test results:`);
    result.debugInfo.selectorResults.forEach(r => {
      console.log(`  "${r.selector}": found ${r.count} elements`);
    });

    if (result.debugInfo.usedSelector) {
      console.log(`✅ Successfully used selector: "${result.debugInfo.usedSelector}"`);
      console.log(`✅ Found ${result.companies.length} companies`);
      
      // Show detailed card extraction results
      if (result.debugInfo.cardDebugInfo.length > 0) {
        console.log(`\n--- CARD EXTRACTION DETAILS ---`);
        result.debugInfo.cardDebugInfo.forEach(card => {
          console.log(`Card ${card.cardIndex}:`);
          console.log(`  HTML: ${card.htmlSample}...`);
          console.log(`  Strategies: ${card.strategies}`);
          console.log(`  Result: ${card.finalResult}`);
          if (card.connectionDebug) {
            console.log(`  Connection Info: "${card.connectionDebug.connectionInfo}"`);
            console.log(`  Names Found: ${card.connectionDebug.connectionNamesFound}`);
            if (card.connectionDebug.connectionNames.length > 0) {
              console.log(`  Connection Names: ${card.connectionDebug.connectionNames.join(', ')}`);
            }
          }
          console.log(``);
        });
      }
    } else {
      console.log(`❌ No working selector found!`);
      
      // Get a sample of the page HTML to debug
      const bodyHTML = await this.page.evaluate(() => document.body.innerHTML.substring(0, 2000));
      console.log('Page HTML sample:', bodyHTML);
    }
    console.log(`=========================\n`);

    return result.companies;
  }

  private async extractDirectConnections(): Promise<Connection[]> {
    if (!this.page) return [];

    return await this.page.evaluate(() => {
      const connections: Connection[] = [];
      const connectionCards = document.querySelectorAll('[data-test-member-card]');

      connectionCards.forEach((card) => {
        try {
          const nameElement = card.querySelector('a span[aria-hidden="true"]');
          const linkElement = card.querySelector('a') as HTMLAnchorElement;
          const headlineElement = card.querySelector('[data-test-member-headline]');

          if (nameElement && linkElement) {
            const name = nameElement.textContent?.trim() || '';
            const profileUrl = linkElement.href;
            const headline = headlineElement?.textContent?.trim() || '';

            if (name && profileUrl) {
              connections.push({
                id: '',
                crawlSessionId: '',
                name,
                headline,
                profileUrl,
                connectionDegree: 1,
                createdAt: ''
              });
            }
          }
        } catch (error) {
          console.warn('Error extracting connection data:', error);
        }
      });

      return connections;
    });
  }

  private async processConnectionSummaryLinks(company: Company & { connectionInfo: string; connectionNames: Array<{name: string, profileUrl: string, profileImageUrl?: string, isConnectionSummary?: boolean, connectionSource?: string}> }): Promise<Company & { connectionInfo: string; connectionNames: Array<{name: string, profileUrl: string, profileImageUrl?: string, isConnectionSummary?: boolean, connectionSource?: string}> }> {
    console.log(`Processing connection summary links for ${company.name}`);
    
    const processedConnectionNames: Array<{name: string, profileUrl: string, profileImageUrl?: string, isConnectionSummary?: boolean, connectionSource?: string}> = [];
    
    for (const connection of company.connectionNames) {
      if (connection.isConnectionSummary && connection.profileUrl.includes('linkedin.com/search/results/people')) {
        console.log(`Following connection link: ${connection.name}`);
        console.log(`URL: ${connection.profileUrl}`);
        
        try {
          // Navigate to the connection details page
          const individualConnections = await this.extractIndividualConnections(connection.profileUrl, connection.name);
          
          // Add all individual connections found
          processedConnectionNames.push(...individualConnections);
          
          // Add a small delay between requests
          await this.wait(2000);
        } catch (error) {
          console.warn(`Failed to process connection link ${connection.profileUrl}:`, error);
          // Keep the original summary if we can't process the details
          processedConnectionNames.push(connection);
        }
      } else {
        // Keep non-summary connections as-is
        processedConnectionNames.push(connection);
      }
    }
    
    return {
      ...company,
      connectionNames: processedConnectionNames
    };
  }

  private async extractIndividualConnections(connectionUrl: string, connectionSource: string): Promise<Array<{name: string, profileUrl: string, profileImageUrl?: string, isConnectionSummary?: boolean, connectionSource?: string}>> {
    if (!this.page) return [];

    try {
      console.log(`Navigating to connection details: ${connectionUrl}`);
      await this.page.goto(connectionUrl, { waitUntil: 'domcontentloaded' });
      await this.wait(3000);

      // Scroll to load more connections
      await this.scrollToLoadResults();

      const connections = await this.page.evaluate((source) => {
        const foundConnections: Array<{name: string, profileUrl: string, profileImageUrl?: string, isConnectionSummary?: boolean, connectionSource?: string}> = [];
        
        // Look for connection cards in the people search results
        const possibleSelectors = [
          '.reusable-search__result-container',
          '[data-test-result-container]',
          '.entity-result',
          '.search-result__wrapper',
          '[data-chameleon-result-urn]'
        ];

        let connectionCards: NodeListOf<Element> | null = null;
        
        for (const selector of possibleSelectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            connectionCards = elements;
            console.log(`Using selector: ${selector}, found ${elements.length} cards`);
            break;
          }
        }

        if (!connectionCards || connectionCards.length === 0) {
          console.log('No connection cards found on the page');
          return foundConnections;
        }

        connectionCards.forEach((card, index) => {
          try {
            // Debug: Log what we're working with
            const cardText = card.textContent?.slice(0, 200) || '';
            console.log(`Processing connection card ${index + 1}: ${cardText}...`);
            
            // Look for profile links
            const profileLinks = Array.from(card.querySelectorAll('a[href*="/in/"]')) as HTMLAnchorElement[];
            console.log(`Found ${profileLinks.length} profile links in card ${index + 1}`);
            
            for (const link of profileLinks) {
              // Try multiple strategies to find the person's name
              let nameText = '';
              
              // Strategy 1: Look for name in specific LinkedIn selectors
              const nameSelectors = [
                'span[aria-hidden="true"]',
                '.entity-result__title-text span',
                '.actor-name',
                '.search-result__result-text h3 span',
                'h3 > span',
                '.result-lockup__name',
                '[data-anonymize="person-name"]'
              ];
              
              for (const selector of nameSelectors) {
                const nameElement = link.querySelector(selector);
                const text = nameElement?.textContent?.trim();
                console.log(`Selector "${selector}": "${text}"`);
                if (text && text.length > 3 && /^[A-Z][a-z]+\s+[A-Z]/.test(text)) {
                  nameText = text;
                  console.log(`Found name with selector "${selector}": "${nameText}"`);
                  break;
                }
              }
              
              // Strategy 2: If no name found in selectors, look at the link text itself
              if (!nameText) {
                const linkText = link.textContent?.trim();
                if (linkText && /^[A-Z][a-z]+\s+[A-Z][a-z]/.test(linkText)) {
                  nameText = linkText;
                }
              }
              
              // Validate this looks like a person's name and filter out unwanted text
              if (nameText && 
                  nameText.length > 3 && 
                  nameText.length < 80 &&
                  /^[A-Z][a-z]+(\s+[A-Z][a-z]*){1,3}$/.test(nameText) && // Must be proper name format (First Last, etc.)
                  !nameText.toLowerCase().includes('linkedin') &&
                  !nameText.toLowerCase().includes('view') &&
                  !nameText.toLowerCase().includes('see') &&
                  !nameText.toLowerCase().includes('profile') &&
                  !nameText.toLowerCase().includes('status') &&
                  !nameText.toLowerCase().includes('offline') &&
                  !nameText.toLowerCase().includes('online') &&
                  !nameText.toLowerCase().includes('connection') &&
                  !nameText.toLowerCase().includes('work') &&
                  !nameText.toLowerCase().includes('company') &&
                  !nameText.toLowerCase().includes('here') &&
                  !/^\d+/.test(nameText) && // Doesn't start with a number
                  link.href.includes('/in/')) {
                
                // Look for profile image
                let profileImageUrl: string | undefined;
                const images = Array.from(card.querySelectorAll('img')) as HTMLImageElement[];
                
                for (const img of images) {
                  const src = img.src;
                  if (src && (
                    src.includes('profile-displayphoto') || 
                    src.includes('person/') || 
                    src.includes('ghostman') ||
                    (src.includes('media') && src.includes('linkedin'))
                  )) {
                    profileImageUrl = src;
                    break;
                  }
                }
                
                foundConnections.push({
                  name: nameText,
                  profileUrl: link.href,
                  profileImageUrl,
                  isConnectionSummary: false,
                  connectionSource: source
                });
                
                // Only take the first valid profile link per card
                break;
              }
            }
          } catch (error) {
            console.log(`Error processing connection card ${index}:`, error);
          }
        });

        console.log(`Extracted ${foundConnections.length} individual connections`);
        return foundConnections;
      }, connectionSource);

      return connections;
    } catch (error) {
      console.error(`Failed to extract individual connections from ${connectionUrl}:`, error);
      return [];
    }
  }

  private async processCompanyConnections(sessionId: string, company: Company & { connectionInfo: string; connectionNames: Array<{name: string, profileUrl: string, profileImageUrl?: string, isConnectionSummary?: boolean, connectionSource?: string}> }): Promise<void> {
    console.log(`Processing company: ${company.name} (${company.linkedinUrl})`);
    console.log(`Connection info: "${company.connectionInfo}"`);
    
    try {
      // Create or get company record
      const existingCompany = this.db.getCompanyByLinkedInUrl(company.linkedinUrl);
      let companyId: string;
      
      if (existingCompany) {
        console.log(`Company already exists in DB: ${existingCompany.name}`);
        companyId = existingCompany.id;
      } else {
        console.log(`Creating new company record: ${company.name}`);
        companyId = this.db.createCompany({
          name: company.name,
          linkedinUrl: company.linkedinUrl,
          logoUrl: company.logoUrl,
          description: company.description
        });
        console.log(`Created company with ID: ${companyId}`);
      }

      // If no specific connection names were found, try to visit the company page to find actual names
      if ((!company.connectionNames || company.connectionNames.length === 0) && 
          company.connectionInfo.match(/\d+\s+connections?\s+work here/i)) {
        console.log(`Attempting to find actual connection names for ${company.name}`);
        const actualConnections = await this.extractConnectionsFromCompanyPage(company.linkedinUrl);
        if (actualConnections.length > 0) {
          company.connectionNames = actualConnections;
          console.log(`Found ${actualConnections.length} actual connection names from company page`);
        }
      }

      // Create connections based on what we extracted from the search results
      if (company.connectionNames && company.connectionNames.length > 0) {
        console.log(`Found ${company.connectionNames.length} named connections for ${company.name}`);
        
        // Create connection records for each named person
        for (const connection of company.connectionNames) {
          const connectionId = this.db.createConnection({
            crawlSessionId: sessionId,
            name: connection.name,
            headline: company.connectionInfo, // Use the connection info as headline
            profileUrl: connection.profileUrl,
            profileImageUrl: connection.profileImageUrl,
            connectionSource: connection.connectionSource,
            connectionDegree: 1,
            company: company.name,
            companyUrl: company.linkedinUrl
          });
          
          // Link the company and connection
          this.db.createCompanyConnection({
            companyId,
            connectionId,
            crawlSessionId: sessionId,
            connectionPath: `You -> ${connection.name}`
          });
          
          console.log(`Created named connection: ${connection.name} -> ${connection.profileUrl}`);
        }
      } else {
        // Fallback: Create a meaningful connection record from the connection info
        console.log(`Creating fallback connection from info: "${company.connectionInfo}"`);
        
        let connectionName: string;
        let headline: string;
        
        if (company.connectionInfo.includes('connection') || company.connectionInfo.includes('people')) {
          // Extract meaningful connection info from patterns like "4 connections work here"
          const numericMatch = company.connectionInfo.match(/(\d+)\s+(connections?|people)/i);
          if (numericMatch) {
            const count = parseInt(numericMatch[1]);
            if (count === 1) {
              connectionName = '1st Degree Connection';
            } else {
              connectionName = `${count} Connections`;
            }
          } else {
            // Fallback for other patterns
            connectionName = company.connectionInfo
              .replace(/\s+(work here|were hired here).*$/i, '')
              .replace(/^\d+\s+/, '') // Remove leading numbers
              .trim();
            
            // If still looks generic, make it more meaningful
            if (connectionName.toLowerCase().includes('connection')) {
              connectionName = 'Your Network Connection';
            } else if (connectionName.toLowerCase().includes('people')) {
              connectionName = 'Network Contact';
            }
          }
          headline = company.connectionInfo;
        } else {
          // For specific names if found
          const nameMatch = company.connectionInfo.match(/^([A-Z][a-z]+ [A-Z][a-z]+)/);
          connectionName = nameMatch ? nameMatch[1] : 'Network Connection';
          headline = company.connectionInfo;
        }
        
        // Create a connection record based on the search result
        const connectionId = this.db.createConnection({
          crawlSessionId: sessionId,
          name: connectionName,
          headline: headline,
          profileUrl: '',
          profileImageUrl: undefined,
          connectionSource: undefined,
          connectionDegree: 1,
          company: company.name,
          companyUrl: company.linkedinUrl
        });

        // Link the company and connection
        this.db.createCompanyConnection({
          companyId,
          connectionId,
          crawlSessionId: sessionId,
          connectionPath: `You -> ${connectionName}`
        });
        
        console.log(`Created connection: "${connectionName}" with headline: "${headline}"`);
      }
      
    } catch (error) {
      console.error(`Error processing company connections for ${company.name}:`, error);
      throw error;
    }
  }


  private async extractConnectionsFromCompanyPage(companyUrl: string): Promise<Array<{name: string, profileUrl: string, profileImageUrl?: string, isConnectionSummary?: boolean, connectionSource?: string}>> {
    if (!this.page) return [];

    try {
      // Navigate to the company page
      console.log(`Navigating to company page: ${companyUrl}`);
      await this.page.goto(companyUrl, { waitUntil: 'domcontentloaded' });
      await this.wait(3000);

      // Look for a "People" or "Employees" section that might show connections
      const connections = await this.page.evaluate(() => {
        const foundConnections: Array<{name: string, profileUrl: string, profileImageUrl?: string, isConnectionSummary?: boolean, connectionSource?: string}> = [];

        // Try to find employee/people sections (could be used for future enhancement)
        // const peopleSelectors = [
        //   '[data-test-id="people-card"]',
        //   '.org-people-bar-graph-element__bar',
        //   '.org-people-details-module__card-spacing',
        //   '.artdeco-card .org-people-bar-graph-element',
        //   '.org-page-navigation__item-anchor[href*="people"]', // People tab
        // ];

        // First try to find a "People" tab and click it
        const peopleTab = document.querySelector('.org-page-navigation__item-anchor[href*="people"]') as HTMLAnchorElement;
        if (peopleTab) {
          console.log('Found people tab, would need to navigate');
          // We could navigate here but it adds complexity
        }

        // Look for any profile links in employee sections
        const profileLinks = Array.from(document.querySelectorAll('a[href*="/in/"]')) as HTMLAnchorElement[];
        
        for (const link of profileLinks) {
          const nameText = link.textContent?.trim();
          // Validate this looks like an actual person name
          if (nameText && 
              nameText.length > 5 && 
              nameText.length < 60 &&
              /^[A-Z][a-z]+ [A-Z][a-z]/.test(nameText) && // Name pattern
              !nameText.toLowerCase().includes('company') &&
              !nameText.toLowerCase().includes('follow') &&
              !nameText.toLowerCase().includes('connect') &&
              !nameText.toLowerCase().includes('view') &&
              link.href.includes('/in/')) {
            
            foundConnections.push({
              name: nameText,
              profileUrl: link.href,
              profileImageUrl: undefined,
              isConnectionSummary: false,
              connectionSource: undefined
            });
          }
        }

        return foundConnections;
      });

      console.log(`Found ${connections.length} connections on company page`);
      return connections.slice(0, 5); // Limit to first 5 to avoid overwhelming
      
    } catch (error) {
      console.warn(`Failed to extract connections from company page: ${error}`);
      return [];
    }
  }

  private async analyzeFriendNetwork(sessionId: string, connection: Connection): Promise<void> {
    if (!this.page) return;

    try {
      // Visit the connection's profile
      await this.page.goto(connection.profileUrl);
      await this.wait(2000);

      // Extract their current company information
      const companyInfo = await this.page.evaluate(() => {
        const companyElement = document.querySelector('[data-test-experience-item]');
        if (!companyElement) return null;

        const companyNameElement = companyElement.querySelector('a span[aria-hidden="true"]');
        const companyLinkElement = companyElement.querySelector('a') as HTMLAnchorElement;

        return {
          name: companyNameElement?.textContent?.trim() || '',
          linkedinUrl: companyLinkElement?.href || ''
        };
      });

      if (companyInfo && companyInfo.name) {
        // Create or get company record
        const existingCompany = this.db.getCompanyByLinkedInUrl(companyInfo.linkedinUrl);
        let companyId: string;
        
        if (existingCompany) {
          companyId = existingCompany.id;
        } else {
          companyId = this.db.createCompany({
            name: companyInfo.name,
            linkedinUrl: companyInfo.linkedinUrl
          });
        }

        // Create connection record
        const connectionId = this.db.createConnection({
          crawlSessionId: sessionId,
          name: connection.name,
          headline: connection.headline,
          profileUrl: connection.profileUrl,
          profileImageUrl: undefined,
          connectionSource: undefined,
          connectionDegree: 1,
          company: companyInfo.name,
          companyUrl: companyInfo.linkedinUrl
        });

        // Link company and connection
        this.db.createCompanyConnection({
          companyId,
          connectionId,
          crawlSessionId: sessionId,
          connectionPath: `You -> ${connection.name} works here`
        });
      }
    } catch (error) {
      console.warn(`Failed to analyze ${connection.name}'s network:`, error);
    }
  }

  private async wait(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}