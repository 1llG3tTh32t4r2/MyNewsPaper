const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = 3000;
const DATA_FILE = path.join(__dirname, "newspaper.json");
const PUBLIC_FOLDER = path.join(__dirname, "public");

function sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, {
        "Content-Type": "application/json"
    });

    res.end(JSON.stringify(data));
}

function readNewspaper() {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function saveNewspaper(data) {
    fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(data, null, 4),
        "utf8"
    );
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

    // Get newspaper data
    if (req.method === "GET" && url.pathname === "/api/newspaper") {
        try {
            const newspaper = readNewspaper();
            sendJSON(res, 200, newspaper);
        } catch (error) {
            sendJSON(res, 500, {
                error: "Could not read newspaper."
            });
        }

        return;
    }

    // Publish article
    if (req.method === "POST" && url.pathname === "/api/publish") {
        let body = "";

        req.on("data", chunk => {
            body += chunk;
        });

        req.on("end", () => {
            try {
                const article = JSON.parse(body);

                if (!article.title || !article.content) {
                    sendJSON(res, 400, {
                        error: "Title and content are required."
                    });
                    return;
                }

                const newspaper = readNewspaper();

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

                newspaper.articles.unshift(newArticle);

                saveNewspaper(newspaper);

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

    // Delete article
    if (
        req.method === "DELETE" &&
        url.pathname.startsWith("/api/delete/")
    ) {
        const id = Number(url.pathname.split("/").pop());

        try {
            const newspaper = readNewspaper();

            newspaper.articles = newspaper.articles.filter(
                article => article.id !== id
            );

            saveNewspaper(newspaper);

            sendJSON(res, 200, {
                message: "Article deleted."
            });

        } catch (error) {
            sendJSON(res, 500, {
                error: "Could not delete article."
            });
        }

        return;
    }

    res.writeHead(404);
    res.end("404 - Not Found");
});

server.listen(PORT, () => {
    console.log(`Newspaper running at http://localhost:${PORT}`);
    console.log(`Admin panel at http://localhost:${PORT}/admin`);
});