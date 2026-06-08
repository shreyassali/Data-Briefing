// netlify/functions/fetch-feeds.js
// Deploy this file at: netlify/functions/fetch-feeds.js in your project root
// Netlify will auto-detect and deploy it as /.netlify/functions/fetch-feeds

const SOURCES = [
  {
    name: "Databricks",
    cat: "Data Engineering",
    color: "#EF9F27",
    rss: "https://www.databricks.com/feed",
  },
  {
    name: "dbt Labs",
    cat: "Analytics Engineering",
    color: "#F0997B",
    rss: "https://www.getdbt.com/blog/rss.xml",
  },
  {
    name: "Snowflake",
    cat: "Analytics Engineering",
    color: "#85B7EB",
    rss: "https://www.snowflake.com/blog/feed/",
  },
  {
    name: "Airbyte",
    cat: "Data Engineering",
    color: "#5DCAA5",
    rss: "https://airbyte.com/blog/rss.xml",
  },
  {
    name: "Dagster",
    cat: "Data Engineering",
    color: "#7F77DD",
    rss: "https://dagster.io/blog/rss.xml",
  },
  {
    name: "Fivetran",
    cat: "Analytics Engineering",
    color: "#639922",
    rss: "https://www.fivetran.com/blog/rss.xml",
  },
  {
    name: "Astronomer",
    cat: "Data Platform",
    color: "#D4537E",
    rss: "https://www.astronomer.io/blog/rss.xml",
  },
  {
    name: "Monte Carlo",
    cat: "Data Platform",
    color: "#888780",
    rss: "https://montecarlo.ai/feed/",
  },
  {
    name: "Google Cloud",
    cat: "Data Platform",
    color: "#534AB7",
    rss: "https://cloudblog.withgoogle.com/products/data-analytics/rss/",
  },
];

// Minimal XML parser — no dependencies needed
function parseRSS(xml, source) {
  const articles = [];

  // Handle both RSS <item> and Atom <entry>
  const itemRegex = /<(?:item|entry)[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];

    const get = (tags) => {
      for (const tag of tags) {
        const m =
          item.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, "i")) ||
          item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
        if (m) return m[1].trim();
      }
      return "";
    };

    const title = get(["title"]).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#8217;/g, "'").replace(/&#8220;/g, '"').replace(/&#8221;/g, '"');
    const linkMatch = item.match(/<link[^>]*href="([^"]+)"/) ||
      item.match(/<link[^>]*>(https?:\/\/[^<]+)<\/link>/);
    const link = linkMatch ? linkMatch[1].trim() : get(["guid"]);
    const rawDate = get(["pubDate", "published", "updated", "dc:date"]);
    const date = rawDate ? new Date(rawDate).toISOString() : new Date().toISOString();
    const rawDesc = get(["description", "summary", "content:encoded", "content"]);
    const snippet = rawDesc
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 250)
      .trim() + "...";

    if (title && link) {
      articles.push({
        title,
        link,
        date,
        snippet,
        source: source.name,
        cat: source.cat,
        color: source.color,
      });
    }
  }

  return articles;
}

exports.handler = async function (event, context) {
  // CORS headers — allow your Netlify domain to call this function
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const results = [];
  const errors = [];

  await Promise.allSettled(
    SOURCES.map(async (source) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout per feed

        const resp = await fetch(source.rss, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; DataBriefingBot/1.0)",
            Accept: "application/rss+xml, application/xml, text/xml, */*",
          },
        });

        clearTimeout(timeout);

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const xml = await resp.text();
        const articles = parseRSS(xml, source);
        results.push(...articles);
      } catch (err) {
        errors.push({ source: source.name, error: err.message });
      }
    })
  );

  // Sort newest first
  results.sort((a, b) => new Date(b.date) - new Date(a.date));

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      articles: results,
      errors,
      fetchedAt: new Date().toISOString(),
      total: results.length,
    }),
  };
};
