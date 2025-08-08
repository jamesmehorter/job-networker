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

    progressCallback(0, 'Starting first degree connections crawl...');

    try {
      // Navigate to the companies search page with first-degree network filter
      const searchUrl = 'https://www.linkedin.com/search/results/companies/?network=%5B%22F%22%5D&origin=FACETED_SEARCH';
      await this.page.goto(searchUrl);
      await this.wait(3000);

      progressCallback(10, 'Loading company results...');

      // Scroll to load more results
      await this.scrollToLoadResults();
      
      progressCallback(30, 'Extracting company data...');

      // Extract company information
      const companies = await this.extractCompaniesFromSearch();
      
      progressCallback(60, `Found ${companies.length} companies. Processing connections...`);

      // Process each company and its connections
      let processedCount = 0;
      for (const company of companies) {
        await this.processCompanyConnections(sessionId, company);
        processedCount++;
        
        const progress = 60 + (processedCount / companies.length) * 35;
        progressCallback(progress, `Processed ${processedCount}/${companies.length} companies`);
        
        await this.wait(this.settings.rateLimit);
      }

      progressCallback(100, `Completed! Found connections at ${companies.length} companies.`);
    } catch (error) {
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

    return await this.page.evaluate(() => {
      const companies: Array<Company & { connectionInfo: string }> = [];
      const companyCards = document.querySelectorAll('[data-test-result-container]');

      companyCards.forEach((card) => {
        try {
          const nameElement = card.querySelector('a[data-test-app-aware-link] span[aria-hidden="true"]');
          const linkElement = card.querySelector('a[data-test-app-aware-link]') as HTMLAnchorElement;
          const logoElement = card.querySelector('img') as HTMLImageElement;
          const descriptionElement = card.querySelector('[data-test-entity-subtitle]');
          const connectionElement = card.querySelector('[data-test-entity-context]');

          if (nameElement && linkElement) {
            const name = nameElement.textContent?.trim() || '';
            const linkedinUrl = linkElement.href;
            const logoUrl = logoElement?.src || '';
            const description = descriptionElement?.textContent?.trim() || '';
            const connectionInfo = connectionElement?.textContent?.trim() || '';

            if (name && linkedinUrl) {
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
          }
        } catch (error) {
          console.warn('Error extracting company data:', error);
        }
      });

      return companies;
    });
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
    // Create or get company record
    const existingCompany = this.db.getCompanyByLinkedInUrl(company.linkedinUrl);
    let companyId: string;
    
    if (existingCompany) {
      companyId = existingCompany.id;
    } else {
      companyId = this.db.createCompany({
        name: company.name,
        linkedinUrl: company.linkedinUrl,
        logoUrl: company.logoUrl,
        description: company.description
      });
    }

    // Create a placeholder connection based on the search result
    const connectionId = this.db.createConnection({
      crawlSessionId: sessionId,
      name: 'Direct Connection', // This would need to be extracted from the connection info
      headline: company.connectionInfo,
      profileUrl: '',
      connectionDegree: 1
    });

    // Link the company and connection
    this.db.createCompanyConnection({
      companyId,
      connectionId,
      crawlSessionId: sessionId,
      connectionPath: 'You -> [Connection Name] works here'
    });
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