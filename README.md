# LinkedIn Job Connection Finder

A Next.js application that helps you discover company connections in your LinkedIn network, making it easier to get referrals and introductions for job opportunities.

## Features

- **LinkedIn Network Analysis**: Crawl your 1st degree connections and their companies
- **Friends of Friends Discovery**: Find companies where your connections' connections work
- **Visual Connection Paths**: See how you're connected to people at companies ("You → John → Company")
- **Privacy-First Design**: All data stored locally on your device
- **Rate-Limited Crawling**: Configurable delays to avoid LinkedIn detection
- **Clean UI**: Modern interface built with Next.js and Tailwind CSS

## Use Cases

This tool helps you write effective networking messages:

1. **Direct Connection**: "Hey Jerry, I'm interested in/applied to your company for X position. Any chance you could grease the wheels to get me seen?"

2. **Introduction Request**: "Hey Joe, I noticed your connection Tom works at X, and they are hiring for a role that I am interested in/applied to. Would you be willing to make an introduction?"

## Tech Stack

- **Next.js 14** with TypeScript and Tailwind CSS
- **Playwright** for LinkedIn automation
- **SQLite** with better-sqlite3 for local data storage
- **OpenAI GPT-4o-mini** for future job analysis features
- **Lucide React** for icons

## Installation

1. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd linkedin-job-connection-finder
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Install Playwright browsers**:
   ```bash
   npx playwright install chromium
   ```

4. **Run the development server**:
   ```bash
   npm run dev
   ```

5. **Open your browser** and navigate to `http://localhost:3000`

## Setup

1. **Configure LinkedIn Credentials**: Enter your LinkedIn email and password in the Settings tab. These are stored securely in your browser's local storage.

2. **Optional - OpenAI API Key**: Add your OpenAI API key for future job analysis features. Get one from [OpenAI's platform](https://platform.openai.com/api-keys).

3. **Adjust Crawl Settings**: Configure rate limiting and other crawl parameters in the Settings tab.

## Usage

### 1st Degree Connections Crawl
- Discovers companies where your direct LinkedIn connections work
- Uses LinkedIn's company search with network filter
- Faster and lower risk

### Friends of Friends Crawl
- Analyzes your connections' networks to find companies where their connections work  
- Provides 2nd degree connection paths
- More comprehensive but takes longer

### Viewing Results
- Select a crawl session from the history
- Browse companies and see connection paths
- Click LinkedIn links to view profiles and company pages

## Privacy & Security

- **Local Storage Only**: All LinkedIn credentials and crawl data stay on your device
- **No External Servers**: Data is never sent to external servers except for direct LinkedIn authentication
- **Encrypted Storage**: Sensitive data is stored securely in your browser
- **Rate Limiting**: Configurable delays to avoid detection and respect LinkedIn's terms

## Rate Limiting Guidelines

- **1000-1500ms**: Fastest but higher risk of detection
- **2500ms (recommended)**: Good balance of speed and safety  
- **5000ms+**: Safest for large crawls but slower

## Important Notes

- **LinkedIn Terms of Service**: This tool automates LinkedIn interactions. Use responsibly and in accordance with LinkedIn's terms of service.
- **Rate Limiting**: Always use appropriate delays to avoid overwhelming LinkedIn's servers
- **Account Safety**: Consider using a secondary LinkedIn account for crawling activities
- **Data Management**: Crawl data includes timestamps - you can delete old sessions to manage storage

## Development

### Database Schema

The app uses SQLite with the following main tables:
- `crawl_sessions`: Track crawl progress and metadata
- `connections`: Store LinkedIn connection information  
- `companies`: Company details and LinkedIn URLs
- `company_connections`: Junction table linking companies to connections

### API Routes

- `GET /api/crawl/sessions` - List all crawl sessions
- `POST /api/crawl/sessions` - Create new crawl session
- `POST /api/crawl/start` - Start crawling process
- `GET /api/crawl/sessions/[id]/connections` - Get session results

### Project Structure

```
src/
├── app/                 # Next.js 14 app router
│   ├── api/            # API routes
│   └── page.tsx        # Main dashboard
├── components/         # React components
│   ├── auth/          # Authentication components
│   ├── crawl/         # Crawl management components
│   └── connections/   # Results display components
├── lib/               # Core utilities
│   ├── database.ts    # SQLite database manager
│   ├── linkedin-crawler.ts # Playwright automation
│   └── storage.ts     # Local storage management
└── types/             # TypeScript type definitions
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is for educational and personal use only. Please respect LinkedIn's terms of service and rate limits.

## Disclaimer

This tool is designed for legitimate networking and job search activities. Users are responsible for compliance with LinkedIn's terms of service and applicable laws. The authors are not responsible for any account restrictions or other consequences resulting from the use of this tool.
