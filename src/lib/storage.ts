import { LinkedInCredentials, OpenAIConfig, CrawlSettings } from '@/types';

const LINKEDIN_CREDENTIALS_KEY = 'linkedin-networker-credentials';
const OPENAI_CONFIG_KEY = 'linkedin-networker-openai';
const CRAWL_SETTINGS_KEY = 'linkedin-networker-settings';

export class StorageManager {
  static saveLinkedInCredentials(credentials: LinkedInCredentials): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LINKEDIN_CREDENTIALS_KEY, JSON.stringify(credentials));
    }
  }

  static getLinkedInCredentials(): LinkedInCredentials | null {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(LINKEDIN_CREDENTIALS_KEY);
      return stored ? JSON.parse(stored) : null;
    }
    return null;
  }

  static removeLinkedInCredentials(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LINKEDIN_CREDENTIALS_KEY);
    }
  }

  static saveOpenAIConfig(config: OpenAIConfig): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(OPENAI_CONFIG_KEY, JSON.stringify(config));
    }
  }

  static getOpenAIConfig(): OpenAIConfig | null {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(OPENAI_CONFIG_KEY);
      return stored ? JSON.parse(stored) : null;
    }
    return null;
  }

  static removeOpenAIConfig(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(OPENAI_CONFIG_KEY);
    }
  }

  static saveCrawlSettings(settings: CrawlSettings): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(CRAWL_SETTINGS_KEY, JSON.stringify(settings));
    }
  }

  static getCrawlSettings(): CrawlSettings {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(CRAWL_SETTINGS_KEY);
      return stored ? JSON.parse(stored) : {
        rateLimit: 2500,
        headless: true
      };
    }
    return {
      rateLimit: 2500,
      headless: true
    };
  }
}