const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

const PORT = process.env.PORT || 3000;

const DATA_FILE = path.join(__dirname, "newspaper.json");
const PUBLIC_FOLDER = path.join(__dirname, "public");

function sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, {
        "Content-Type": "application/json"
    });

    res.end(JSON.stringify(data));
}

async function initializeDatabase() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS articles (
            id BIGINT PRIMARY KEY,
            title TEXT NOT NULL,
            category TEXT DEFAULT 'General',
            author TEXT DEFAULT 'Staff',
            description TEXT DEFAULT '',
            content TEXT NOT NULL,
            image TEXT DEFAULT '',
            date TEXT NOT NULL
        )
    `);

    const result = await pool.query(
        "SELECT COUNT(*) FROM articles"
    );

    if (Number(result.rows[0].count) === 0) {
        try {
            const newspaper = JSON.parse(
                fs.readFileSync(DATA_FILE, "utf8")
            );

            for (const article of newspaper.articles || []) {
                await pool.query(
                    `
                    INSERT INTO articles
                    (id, title, category, author, description, content, image, date)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    ON CONFLICT (id) DO NOTHING
                    `,
                    [
                        article.id,
                        article.title,
                        article.category || "General",
                        article.author || "Staff",
                        article.description || "",
                        article.content,
                        article.image || "",
                        article.date
                    ]
                );
            }

            console.log("Existing newspaper articles imported into PostgreSQL.");
        } catch (error) {
            console.log("No existing articles were imported.");
        }
    }

    console.log("PostgreSQL database ready.");
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // Public newspaper
    if (req.method === "GET" && url.pathname === "/") {
        const file = path.join(PUBLIC_FOLDER, "index.html");

        fs.readFile(file, (err, content) => {
            if (err) {
                res.writeHead(500);
                res.end("Could not load newspaper.");
                return;
            }

            res.writeHead(200, {
                "Content-Type": "text/html"
            });

            res.end(content);
        });

        return;
    }

    // Admin page
    if (req.method === "GET" && url.pathname === "/admin") {
        const file = path.join(PUBLIC_FOLDER, "admin.html");

        fs.readFile(file, (err, content) => {
            if (err) {
                res.writeHead(500);
                res.end("Could not load admin page.");
                return;
            }

            res.writeHead(200, {
                "Content-Type": "text/html"
            });

            res.end(content);
        });

        return;
    }

    // Get newspaper data from PostgreSQL
    if (req.method === "GET" && url.pathname === "/api/newspaper") {
        pool.query(
            "SELECT * FROM articles ORDER BY id DESC"
        )
        .then(result => {
            sendJSON(res, 200, {
                articles: result.rows
            });
        })
        .catch(error => {
            console.error(error);

            sendJSON(res, 500, {
                error: "Could not load newspaper."
            });
        });

        return;
    }

    // Publish article to PostgreSQL
    if (req.method === "POST" && url.pathname === "/api/publish") {
        let body = "";

        req.on("data", chunk => {
            body += chunk;
        });

        req.on("end", async () => {
            try {
                const article = JSON.parse(body);

                if (!article.title || !article.content) {
                    sendJSON(res, 400, {
                        error: "Title and content are required."
                    });
                    return;
                }

                const newArticle = {
                    id: Date.now(),
                    title: article.title,
                    category: article.category || "General",
                    author: article.author || "Staff",
                    description: article.description || "",
                    content: article.content,
                    image: article.image || "",
                    date: new Date().toLocaleDateString()
                };

                await pool.query(
                    `
                    INSERT INTO articles
                    (id, title, category, author, description, content, image, date)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    `,
                    [
                        newArticle.id,
                        newArticle.title,
                        newArticle.category,
                        newArticle.author,
                        newArticle.description,
                        newArticle.content,
                        newArticle.image,
                        newArticle.date
                    ]
                );

                sendJSON(res, 200, {
                    message: "Article published!",
                    article: newArticle
                });

            } catch (error) {
                console.error(error);

                sendJSON(res, 400, {
                    error: error.message
                });
            }
        });

        return;
    }

    // Delete article from PostgreSQL
    if (
        req.method === "DELETE" &&
        url.pathname.startsWith("/api/delete/")
    ) {
        const id = Number(url.pathname.split("/").pop());

        pool.query(
            "DELETE FROM articles WHERE id = $1",
            [id]
        )
        .then(() => {
            sendJSON(res, 200, {
                message: "Article deleted."
            });
        })
        .catch(error => {
            console.error(error);

            sendJSON(res, 500, {
                error: "Could not delete article."
            });
        });

        return;
    }

    res.writeHead(404);
    res.end("404 - Not Found");
});

async function startServer() {
    try {
        await initializeDatabase();

        server.listen(PORT, "0.0.0.0", () => {
            console.log(`Newspaper running at http://localhost:${PORT}`);
            console.log(`Admin panel at http://localhost:${PORT}/admin`);
        });
    } catch (error) {
        console.error("Could not start server:", error);
        process.exit(1);
    }
}

startServer();
