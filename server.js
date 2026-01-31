const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static("public"));

// Function for authenticated scraping with session management
async function authenticatedScrape(
  loginUrl,
  credentials,
  dashboardUrl,
  selectors,
) {
  try {
    console.log("Starting authenticated scraping...");

    // Create axios instance with cookie jar simulation
    const axiosInstance = axios.create({
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
      },
      withCredentials: true,
      timeout: 30000,
    });

    let cookies = "";

    // Step 1: Get login page to extract any CSRF tokens or form data
    console.log("Step 1: Getting login page...");
    const loginPageResponse = await axiosInstance.get(loginUrl);

    // Extract cookies from login page
    if (loginPageResponse.headers["set-cookie"]) {
      cookies = loginPageResponse.headers["set-cookie"]
        .map((cookie) => cookie.split(";")[0])
        .join("; ");
    }

    // Parse login page to find form details
    const loginPage$ = cheerio.load(loginPageResponse.data);

    // Look for CSRF token or other hidden fields
    const csrfToken =
      loginPage$('input[name="_token"]').val() ||
      loginPage$('input[name="csrf_token"]').val() ||
      loginPage$('meta[name="csrf-token"]').attr("content");

    // Step 2: Perform login
    console.log("Step 2: Performing login...");

    // Prepare login data
    const loginData = {
      ...credentials, // username, password, etc.
      ...(csrfToken && { _token: csrfToken }), // Add CSRF token if found
    };

    // Determine if we should POST to the same URL or a different action URL
    const loginForm = loginPage$("form");
    const actionUrl = loginForm.attr("action");
    const loginPostUrl = actionUrl
      ? actionUrl.startsWith("http")
        ? actionUrl
        : new URL(actionUrl, loginUrl).href
      : loginUrl;

    const loginResponse = await axiosInstance.post(loginPostUrl, loginData, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookies,
        Referer: loginUrl,
      },
      maxRedirects: 5,
    });

    // Update cookies after login
    if (loginResponse.headers["set-cookie"]) {
      const newCookies = loginResponse.headers["set-cookie"]
        .map((cookie) => cookie.split(";")[0])
        .join("; ");
      cookies = cookies ? `${cookies}; ${newCookies}` : newCookies;
    }

    // Step 3: Access dashboard with authenticated session
    console.log("Step 3: Accessing dashboard...");
    const dashboardResponse = await axiosInstance.get(dashboardUrl, {
      headers: {
        Cookie: cookies,
        Referer: loginPostUrl,
      },
    });

    // Check if this is a JavaScript-heavy application
    const initialContent = dashboardResponse.data;
    if (
      initialContent.includes("Loading") ||
      initialContent.includes("_next/static")
    ) {
      console.log(
        "Detected JavaScript-heavy application. This requires browser automation.",
      );

      return {
        success: false,
        error:
          "This website requires JavaScript execution. The page shows loading screens and uses client-side rendering. Consider using Puppeteer or Selenium for this type of scraping.",
        data: [],
        suggestion:
          "Use browser automation tools like Puppeteer, Playwright, or Selenium to handle JavaScript-rendered content.",
      };
    }

    // Step 4: Scrape data from dashboard
    console.log("Step 4: Scraping dashboard data...");
    const dashboard$ = cheerio.load(dashboardResponse.data);
    const scrapedData = [];

    // Debug: Log the HTML content (first 500 characters)
    console.log(
      "Dashboard HTML preview:",
      dashboardResponse.data.substring(0, 500),
    );

    // Debug: Test container selector
    const containerElements = dashboard$(selectors.container);
    console.log(
      `Found ${containerElements.length} container elements with selector: ${selectors.container}`,
    );

    // If no containers found, try alternative approaches
    if (containerElements.length === 0) {
      console.log("No containers found, trying to extract from entire page...");

      // Try extracting data from the entire page
      const pageData = {};
      Object.keys(selectors.fields).forEach((field) => {
        const selector = selectors.fields[field];
        const elements = dashboard$(selector);
        console.log(
          `Field '${field}' with selector '${selector}': found ${elements.length} elements`,
        );

        if (elements.length > 0) {
          pageData[field] = elements
            .map((i, el) => dashboard$(el).text().trim())
            .get()
            .join(" | ");
        } else {
          pageData[field] = "N/A";
        }
      });

      if (Object.values(pageData).some((value) => value !== "N/A")) {
        scrapedData.push(pageData);
      }
    } else {
      // Apply selectors to extract data from containers
      dashboard$(selectors.container).each((index, element) => {
        const item = {};

        Object.keys(selectors.fields).forEach((field) => {
          const selector = selectors.fields[field];
          item[field] =
            dashboard$(element).find(selector).text().trim() || "N/A";
        });

        if (Object.values(item).some((value) => value !== "N/A")) {
          scrapedData.push(item);
        }
      });
    }

    // Debug: Save dashboard HTML to file for inspection
    fs.writeFileSync("debug_dashboard.html", dashboardResponse.data);
    console.log("Dashboard HTML saved to debug_dashboard.html for inspection");

    return {
      success: true,
      data: scrapedData,
      message: `Successfully scraped ${scrapedData.length} items from authenticated dashboard`,
    };
  } catch (error) {
    console.error("Authenticated scraping error:", error.message);
    return {
      success: false,
      error: error.message,
      data: [],
    };
  }
}

// Function for browser-based authenticated scraping (for JavaScript-heavy sites)
async function browserAuthenticatedScrape(
  loginUrl,
  credentials,
  dashboardUrl,
  selectors,
) {
  let browser;
  try {
    console.log("Starting browser-based authenticated scraping...");

    // Launch browser
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    // Set user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    );

    // Step 1: Navigate to login page
    console.log("Step 1: Navigating to login page...");
    await page.goto(loginUrl, { waitUntil: "networkidle2" });

    // Step 2: Fill login form and submit
    console.log("Step 2: Filling login form...");

    // Try common username field selectors
    const usernameSelectors = [
      'input[name="username"]',
      'input[name="email"]',
      'input[type="email"]',
      'input[name="login"]',
      "#username",
      "#email",
      ".username",
      ".email",
    ];

    const passwordSelectors = [
      'input[name="password"]',
      'input[type="password"]',
      "#password",
      ".password",
    ];

    // Find and fill username field
    let usernameField = null;
    for (const selector of usernameSelectors) {
      try {
        usernameField = await page.$(selector);
        if (usernameField) {
          await page.type(selector, credentials.username || credentials.email);
          console.log(`Found username field with selector: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    // Find and fill password field
    let passwordField = null;
    for (const selector of passwordSelectors) {
      try {
        passwordField = await page.$(selector);
        if (passwordField) {
          await page.type(selector, credentials.password);
          console.log(`Found password field with selector: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!usernameField || !passwordField) {
      throw new Error("Could not find login form fields");
    }

    // Submit form
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:contains("Login")',
      'button:contains("Sign in")',
      ".login-button",
      ".submit-button",
    ];

    let submitted = false;
    for (const selector of submitSelectors) {
      try {
        const submitButton = await page.$(selector);
        if (submitButton) {
          await Promise.all([
            page.waitForNavigation({
              waitUntil: "networkidle2",
              timeout: 10000,
            }),
            page.click(selector),
          ]);
          console.log(`Submitted form with selector: ${selector}`);
          submitted = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!submitted) {
      // Try pressing Enter on password field
      await page.keyboard.press("Enter");
      await page.waitForNavigation({
        waitUntil: "networkidle2",
        timeout: 10000,
      });
    }

    // Step 3: Navigate to dashboard
    console.log("Step 3: Navigating to dashboard...");
    await page.goto(dashboardUrl, { waitUntil: "networkidle2" });

    // Wait for content to load
    await page.waitForTimeout(3000);

    // Step 4: Extract data using selectors
    console.log("Step 4: Extracting data...");

    const scrapedData = await page.evaluate((selectors) => {
      const data = [];

      // Find container elements
      const containers = document.querySelectorAll(selectors.container);

      if (containers.length === 0) {
        // If no containers, extract from entire page
        const pageData = {};
        Object.keys(selectors.fields).forEach((field) => {
          const elements = document.querySelectorAll(selectors.fields[field]);
          if (elements.length > 0) {
            pageData[field] = Array.from(elements)
              .map((el) => el.textContent.trim())
              .filter((text) => text.length > 0)
              .join(" | ");
          } else {
            pageData[field] = "N/A";
          }
        });

        if (Object.values(pageData).some((value) => value !== "N/A")) {
          data.push(pageData);
        }
      } else {
        // Extract from each container
        containers.forEach((container) => {
          const item = {};
          Object.keys(selectors.fields).forEach((field) => {
            const elements = container.querySelectorAll(
              selectors.fields[field],
            );
            if (elements.length > 0) {
              item[field] = Array.from(elements)
                .map((el) => el.textContent.trim())
                .filter((text) => text.length > 0)
                .join(" | ");
            } else {
              item[field] = "N/A";
            }
          });

          if (Object.values(item).some((value) => value !== "N/A")) {
            data.push(item);
          }
        });
      }

      return data;
    }, selectors);

    // Save screenshot for debugging
    await page.screenshot({
      path: "debug_dashboard_screenshot.png",
      fullPage: true,
    });
    console.log("Screenshot saved to debug_dashboard_screenshot.png");

    return {
      success: true,
      data: scrapedData,
      message: `Successfully scraped ${scrapedData.length} items using browser automation`,
    };
  } catch (error) {
    console.error("Browser scraping error:", error.message);
    return {
      success: false,
      error: error.message,
      data: [],
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Function to scrape data from a website or API
async function scrapeData(url, selectors, dataType = "auto") {
  try {
    console.log(`Scraping data from: ${url}`);

    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    let scrapedData = [];

    // Auto-detect or use specified data type
    const isJson =
      dataType === "json" ||
      (dataType === "auto" &&
        typeof response.data === "object" &&
        response.data !== null);

    if (isJson) {
      console.log("Processing JSON data...");

      // If it's an array, use it directly
      if (Array.isArray(response.data)) {
        scrapedData = response.data;
      } else if (typeof response.data === "object") {
        // If it's an object, wrap it in an array
        scrapedData = [response.data];
      }

      // If selectors are provided for JSON, filter/map the data
      if (selectors && selectors.fields) {
        scrapedData = scrapedData.map((item) => {
          const filteredItem = {};
          Object.keys(selectors.fields).forEach((field) => {
            const jsonPath = selectors.fields[field];
            // Simple dot notation support (e.g., "user.name")
            filteredItem[field] =
              getNestedValue(item, jsonPath) || item[jsonPath] || "N/A";
          });
          return filteredItem;
        });
      }
    } else {
      // HTML scraping with Cheerio
      console.log("Processing HTML data...");
      const $ = cheerio.load(response.data);

      if (!selectors || !selectors.container) {
        throw new Error(
          "HTML scraping requires selectors with container property",
        );
      }

      $(selectors.container).each((index, element) => {
        const item = {};

        // Extract data based on provided selectors
        Object.keys(selectors.fields).forEach((field) => {
          const selector = selectors.fields[field];
          item[field] = $(element).find(selector).text().trim() || "N/A";
        });

        if (Object.values(item).some((value) => value !== "N/A")) {
          scrapedData.push(item);
        }
      });
    }

    return scrapedData;
  } catch (error) {
    console.error("Error scraping data:", error.message);
    return [];
  }
}

// Helper function to get nested values from objects
function getNestedValue(obj, path) {
  return path.split(".").reduce((current, key) => current && current[key], obj);
}

// Function to save data to migrated_data.js
function saveDataToFile(data) {
  try {
    const dataContent = `// Auto-generated scraped data
const scrapedData = ${JSON.stringify(data, null, 2)};

module.exports = scrapedData;
`;

    fs.writeFileSync("migrated_data.js", dataContent);
    console.log("Data saved to migrated_data.js");
  } catch (error) {
    console.error("Error saving data to file:", error.message);
  }
}

// API endpoint to trigger scraping
app.post("/scrape", async (req, res) => {
  try {
    const { url, selectors, dataType } = req.body;

    if (!url) {
      return res.status(400).json({
        error: "URL is required",
      });
    }

    const scrapedData = await scrapeData(url, selectors, dataType);

    if (scrapedData.length > 0) {
      saveDataToFile(scrapedData);
      res.json({
        success: true,
        message: `Successfully scraped ${scrapedData.length} items`,
        data: scrapedData,
      });
    } else {
      res.json({
        success: false,
        message: "No data found with the provided selectors",
      });
    }
  } catch (error) {
    console.error("Scraping error:", error);
    res.status(500).json({
      error: "Internal server error during scraping",
    });
  }
});

// API endpoint for authenticated scraping
app.post("/scrape-authenticated", async (req, res) => {
  try {
    const { loginUrl, credentials, dashboardUrl, selectors } = req.body;

    // Validate required fields
    if (!loginUrl || !credentials || !dashboardUrl || !selectors) {
      return res.status(400).json({
        error:
          "loginUrl, credentials, dashboardUrl, and selectors are required",
        example: {
          loginUrl: "https://example.com/login",
          credentials: { username: "your_username", password: "your_password" },
          dashboardUrl: "https://example.com/dashboard",
          selectors: {
            container: ".data-item",
            fields: { title: ".title", value: ".value" },
          },
        },
      });
    }

    console.log("Starting authenticated scraping process...");
    const result = await authenticatedScrape(
      loginUrl,
      credentials,
      dashboardUrl,
      selectors,
    );

    if (result.success && result.data.length > 0) {
      saveDataToFile(result.data);
      res.json({
        success: true,
        message: result.message,
        data: result.data,
      });
    } else {
      res.json({
        success: false,
        message: result.error || "No data found after authentication",
        data: result.data || [],
      });
    }
  } catch (error) {
    console.error("Authenticated scraping error:", error);
    res.status(500).json({
      error: "Internal server error during authenticated scraping",
    });
  }
});

// API endpoint for browser-based authenticated scraping (for JavaScript-heavy sites)
app.post("/scrape-browser-authenticated", async (req, res) => {
  try {
    const { loginUrl, credentials, dashboardUrl, selectors } = req.body;

    // Validate required fields
    if (!loginUrl || !credentials || !dashboardUrl || !selectors) {
      return res.status(400).json({
        error:
          "loginUrl, credentials, dashboardUrl, and selectors are required",
        example: {
          loginUrl: "https://example.com/login",
          credentials: { username: "your_username", password: "your_password" },
          dashboardUrl: "https://example.com/dashboard",
          selectors: {
            container: ".data-item",
            fields: { title: ".title", value: ".value" },
          },
        },
      });
    }

    console.log("Starting browser-based authenticated scraping process...");
    const result = await browserAuthenticatedScrape(
      loginUrl,
      credentials,
      dashboardUrl,
      selectors,
    );

    if (result.success && result.data.length > 0) {
      saveDataToFile(result.data);
      res.json({
        success: true,
        message: result.message,
        data: result.data,
      });
    } else {
      res.json({
        success: false,
        message: result.error || "No data found after browser authentication",
        data: result.data || [],
      });
    }
  } catch (error) {
    console.error("Browser authenticated scraping error:", error);
    res.status(500).json({
      error: "Internal server error during browser authenticated scraping",
    });
  }
});

// API endpoint to get scraped data
app.get("/api/data", (req, res) => {
  try {
    // Clear require cache to get fresh data
    delete require.cache[require.resolve("./migrated_data.js")];
    const data = require("./migrated_data.js");
    res.json(data);
  } catch (error) {
    console.error("Error reading data:", error);
    res.json([]);
  }
});

// Serve the HTML page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Example scraping endpoint for demonstration
app.get("/scrape-example", async (req, res) => {
  try {
    // Example: Scraping quotes from quotes.toscrape.com
    const exampleSelectors = {
      container: ".quote",
      fields: {
        text: ".text",
        author: ".author",
        tags: ".tags .tag",
      },
    };

    const scrapedData = await scrapeData(
      "http://quotes.toscrape.com/",
      exampleSelectors,
    );

    if (scrapedData.length > 0) {
      saveDataToFile(scrapedData);
      res.json({
        success: true,
        message: `Successfully scraped ${scrapedData.length} quotes`,
        data: scrapedData,
      });
    } else {
      res.json({
        success: false,
        message: "No data found",
      });
    }
  } catch (error) {
    console.error("Example scraping error:", error);
    res.status(500).json({
      error: "Error during example scraping",
    });
  }
});

// JSONPlaceholder API scraping endpoint
app.get("/scrape-jsonplaceholder", async (req, res) => {
  try {
    console.log("Scraping JSONPlaceholder posts...");

    // For JSON APIs, we can optionally filter fields
    const jsonSelectors = {
      fields: {
        id: "id",
        title: "title",
        body: "body",
        userId: "userId",
      },
    };

    const scrapedData = await scrapeData(
      "https://jsonplaceholder.typicode.com/posts",
      jsonSelectors,
      "json",
    );

    if (scrapedData.length > 0) {
      saveDataToFile(scrapedData);
      res.json({
        success: true,
        message: `Successfully scraped ${scrapedData.length} posts from JSONPlaceholder`,
        data: scrapedData,
      });
    } else {
      res.json({
        success: false,
        message: "No data found",
      });
    }
  } catch (error) {
    console.error("JSONPlaceholder scraping error:", error);
    res.status(500).json({
      error: "Error during JSONPlaceholder scraping",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log("Available endpoints:");
  console.log("- GET / : View scraped data in HTML table");
  console.log("- POST /scrape : Scrape data from custom URL");
  console.log(
    "- POST /scrape-authenticated : Scrape data with login authentication",
  );
  console.log("- GET /api/data : Get scraped data as JSON");
  console.log(
    "- GET /scrape-example : Scrape example data from quotes.toscrape.com",
  );
  console.log(
    "- GET /scrape-jsonplaceholder : Scrape posts from JSONPlaceholder API",
  );
});
