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
        await this.processCompanyConnections(sessionId, company);
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

  private async extractCompaniesFromSearch(): Promise<Array<Company & { connectionInfo: string }>> {
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
      const companies: Array<Company & { connectionInfo: string }> = [];
      const debugInfo = {
        usedSelector: '',
        selectorResults: [] as Array<{ selector: string; count: number }>,
        pageTitle: document.title
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
          
          // Debug: Log what we're working with
          const cardHTML = card.outerHTML.substring(0, 200);
          console.log(`\n--- Card ${cardIndex + 1} ---`);
          console.log(`Card HTML sample: ${cardHTML}...`);

          // Strategy 1: Original approach
          nameElement = card.querySelector('a[data-test-app-aware-link] span[aria-hidden="true"]');
          linkElement = card.querySelector('a[data-test-app-aware-link]') as HTMLAnchorElement;

          // Strategy 2: More generic approach
          if (!nameElement || !linkElement) {
            const allLinks = Array.from(card.querySelectorAll('a'));
            for (const link of allLinks) {
              if (link.href?.includes('/company/')) {
                linkElement = link as HTMLAnchorElement;
                nameElement = link.querySelector('span') || link;
                break;
              }
            }
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

          // Strategy 5: Even more generic - find any meaningful link
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

          console.log(`Strategy results: nameElement=${nameElement?.tagName}, linkElement=${linkElement?.href}`);
          
          if (nameElement && linkElement) {
            const name = nameElement.textContent?.trim() || '';
            const linkedinUrl = linkElement.href;
            
            console.log(`✅ Extracted: "${name}" -> ${linkedinUrl}`);
            
            // Extract other information with fallback selectors
            const logoElement = card.querySelector('img') as HTMLImageElement;
            const descriptionElement = card.querySelector('[data-test-entity-subtitle], .entity-result__summary, .search-result__info .subline-level-1');
            const connectionElement = card.querySelector('[data-test-entity-context], .entity-result__context, .search-result__info .subline-level-2');

            const logoUrl = logoElement?.src || '';
            const description = descriptionElement?.textContent?.trim() || '';
            const connectionInfo = connectionElement?.textContent?.trim() || '';

            if (name && linkedinUrl && linkedinUrl.includes('linkedin.com')) {
              companies.push({
                id: '',
                name,
                linkedinUrl,
                logoUrl,
                description,
                createdAt: '',
                connectionInfo
              });
            }
          } else {
            console.log(`❌ No valid extraction for Card ${cardIndex + 1}`);
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

  private async processCompanyConnections(sessionId: string, company: Company & { connectionInfo: string }): Promise<void> {
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

      // Extract connection name from connectionInfo if possible
      let connectionName = 'Direct Connection';
      if (company.connectionInfo) {
        // Try to parse connection info like "John Smith works here" or "2 connections work here"
        const nameMatch = company.connectionInfo.match(/^([^•]+?)(?:\s+(?:works?|work)\s+here|•|$)/i);
        if (nameMatch && nameMatch[1] && !nameMatch[1].includes('connection')) {
          connectionName = nameMatch[1].trim();
        }
      }
      
      console.log(`Creating connection record: ${connectionName}`);

      // Create a connection record based on the search result
      const connectionId = this.db.createConnection({
        crawlSessionId: sessionId,
        name: connectionName,
        headline: company.connectionInfo,
        profileUrl: '', // We don't have individual profile URLs from company search
        connectionDegree: 1,
        company: company.name,
        companyUrl: company.linkedinUrl
      });
      console.log(`Created connection with ID: ${connectionId}`);

      // Link the company and connection
      const companyConnectionId = this.db.createCompanyConnection({
        companyId,
        connectionId,
        crawlSessionId: sessionId,
        connectionPath: `You -> ${connectionName} works here`
      });
      console.log(`Created company-connection link with ID: ${companyConnectionId}`);
      
    } catch (error) {
      console.error(`Error processing company connections for ${company.name}:`, error);
      throw error;
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