# Data Scraping Project

A web data scraping application built with Node.js, Express, Axios, and Cheerio that extracts data from websites and displays it in a user-friendly HTML table format.

## 🚀 Features

- **Web Scraping**: Extract data from HTML websites and JSON APIs
- **Real-time Dashboard**: Beautiful HTML interface to view scraped data
- **Custom Scraping**: Configure your own URLs and selectors
- **Data Storage**: Automatically saves scraped data to JavaScript files
- **Multiple Data Types**: Supports both HTML scraping and JSON API consumption
- **Example Endpoints**: Pre-configured examples for testing

## 🛠️ Technologies Used

- **Node.js** - Runtime environment
- **Express** - Web framework
- **Axios** - HTTP client for making requests
- **Cheerio** - Server-side HTML parsing
- **Nodemon** - Development auto-restart

## 📦 Installation

1. Clone the repository:

```bash
git clone <your-repo-url>
cd data-scrapping
```

2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

4. Open your browser and go to: `http://localhost:3000`

## 🎯 Usage

### Dashboard Interface

Visit `http://localhost:3000` to access the web dashboard where you can:

- **Refresh Data**: Load the latest scraped data
- **Scrape Example Data**: Test with quotes from quotes.toscrape.com
- **Scrape JSONPlaceholder**: Test with JSON API data
- **Custom Scrape**: Configure your own scraping parameters

### API Endpoints

- `GET /` - Main dashboard
- `GET /api/data` - Get scraped data as JSON
- `POST /scrape` - Custom scraping endpoint
- `GET /scrape-example` - Example HTML scraping
- `GET /scrape-jsonplaceholder` - Example JSON API scraping

### Custom Scraping

Use the custom scraping form or API to scrape any website:

**For HTML websites:**

```json
{
  "url": "https://example.com",
  "dataType": "html",
  "selectors": {
    "container": ".item",
    "fields": {
      "title": ".title",
      "description": ".description"
    }
  }
}
```

**For JSON APIs:**

```json
{
  "url": "https://api.example.com/data",
  "dataType": "json",
  "selectors": {
    "fields": {
      "id": "id",
      "name": "name"
    }
  }
}
```

## 📁 Project Structure

```
├── server.js              # Main Express server
├── app.js                 # Alternative entry point
├── package.json           # Dependencies and scripts
├── migrated_data.js       # Scraped data storage
├── public/
│   └── index.html         # Dashboard interface
└── README.md              # Project documentation
```

## 🔧 Configuration

### Environment Variables

- `PORT` - Server port (default: 3000)

### Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with auto-restart

## 📝 Data Storage

Scraped data is automatically saved to `migrated_data.js` in the following format:

```javascript
// Auto-generated scraped data
const scrapedData = [
  {
    field1: "value1",
    field2: "value2",
  },
];

module.exports = scrapedData;
```

## ⚠️ Important Notes

- **Respect robots.txt**: Always check website's robots.txt before scraping
- **Rate Limiting**: Be mindful of request frequency to avoid being blocked
- **Legal Compliance**: Ensure you have permission to scrape target websites
- **Error Handling**: The application includes comprehensive error handling

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 🔗 Example Usage

### Testing with JSONPlaceholder

The project includes a pre-configured example that scrapes data from JSONPlaceholder (a free JSON API for testing):

```bash
curl http://localhost:3000/scrape-jsonplaceholder
```

### Testing with Quotes Website

Test HTML scraping with the quotes example:

```bash
curl http://localhost:3000/scrape-example
```

## 🛡️ Security Considerations

- Input validation for URLs and selectors
- Error handling for network failures
- Safe HTML parsing with Cheerio
- No execution of arbitrary code from scraped content

---

**Note**: This project is for educational and development purposes. Always ensure you comply with website terms of service and applicable laws when scraping data.
