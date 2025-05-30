import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// Default VLESS server WebSocket URL.
// It's highly recommended to load this from an environment variable in Deno Deploy
// (e.g., Deno.env.get("DEFAULT_VLESS_URL") || "wss://default-vless.com/path").
// For this example, it's hardcoded for simplicity, but consider environment variables for production.
let VLESS_SERVER_WS_URL_DEFAULT = "ws://47.128.249.85:21835/"; // Updated based on user's VLESS config (security=none implies ws://)

async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const upgradeHeader = req.headers.get("upgrade") || "";
    const method = req.method;

    // --- Handle WebSocket upgrade requests ---
    if (upgradeHeader.toLowerCase() === "websocket") {
        // Extract the target VLESS server URL from the query parameter.
        // This allows the user to specify their own VLESS backend.
        const targetVlessUrl = url.searchParams.get("vlessUrl");

        // If no vlessUrl query parameter is provided, use the default.
        // In a real application, you might want to enforce this parameter or provide a clear error.
        if (!targetVlessUrl) {
            console.error("WebSocket upgrade request received without 'vlessUrl' query parameter.");
            return new Response("Missing VLESS server URL. Please provide it as a 'vlessUrl' query parameter.", { status: 400 });
        }

        // Basic validation for the target URL
        if (!targetVlessUrl.startsWith("wss://") && !targetVlessUrl.startsWith("ws://")) {
            console.error(`Invalid VLESS server URL format: ${targetVlessUrl}`);
            return new Response("Invalid VLESS server URL. Must start with 'wss://' or 'ws://'.", { status: 400 });
        }

        console.log(`Attempting to proxy WebSocket to: ${targetVlessUrl}`);

        let vlessServerSocket: WebSocket;
        try {
            // Upgrade the incoming client request to a WebSocket connection
            const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);

            // Establish an outbound WebSocket connection to the actual VLESS server
            vlessServerSocket = new WebSocket(targetVlessUrl);

            // Event listener for when the VLESS server WebSocket opens
            vlessServerSocket.onopen = () => {
                console.log(`[Backend WS] Connected to VLESS server: ${targetVlessUrl}`);
            };

            // Event listener for messages from the client (forward to VLESS server)
            clientSocket.onmessage = (event) => {
                if (vlessServerSocket.readyState === WebSocket.OPEN) {
                    vlessServerSocket.send(event.data);
                } else {
                    console.warn("[Client WS] Backend VLESS WebSocket not open, dropping message.");
                }
            };

            // Event listener for messages from the VLESS server (forward to client)
            vlessServerSocket.onmessage = (event) => {
                if (clientSocket.readyState === WebSocket.OPEN) {
                    clientSocket.send(event.data);
                } else {
                    console.warn("[Backend WS] Client WebSocket not open, dropping message.");
                }
            };

            // Handle closing for both sockets
            clientSocket.onclose = (event) => {
                console.log(`[Client WS] Closed. Code: ${event.code}, Reason: ${event.reason}`);
                // Close the backend socket if the client disconnects
                if (vlessServerSocket.readyState === WebSocket.OPEN) {
                    vlessServerSocket.close(event.code, event.reason);
                }
            };
            vlessServerSocket.onclose = (event) => {
                console.log(`[Backend WS] Closed. Code: ${event.code}, Reason: ${event.reason}`);
                // Close the client socket if the backend disconnects
                if (clientSocket.readyState === WebSocket.OPEN) {
                    clientSocket.close(event.code, event.reason);
                }
            };

            // Handle errors for both sockets
            clientSocket.onerror = (event) => {
                console.error("[Client WS] Error:", event);
                // Attempt to close backend socket on client error
                if (vlessServerSocket.readyState === WebSocket.OPEN) {
                    vlessServerSocket.close(1011, "Client error"); // 1011: Internal Error
                }
            };
            vlessServerSocket.onerror = (event) => {
                console.error("[Backend WS] Error:", event);
                // Attempt to close client socket on backend error
                if (clientSocket.readyState === WebSocket.OPEN) {
                    clientSocket.close(1011, "Backend error"); // 1011: Internal Error
                }
            };

            return response; // Return the response to complete the WebSocket handshake
        } catch (error) {
            console.error("WebSocket upgrade failed or backend connection error:", error);
            // Ensure any partially opened backend socket is closed on error
            if (vlessServerSocket && vlessServerSocket.readyState === WebSocket.CONNECTING) {
                vlessServerSocket.close(1011, "Proxy setup failed");
            }
            return new Response(`WebSocket proxy setup failed: ${error.message}`, { status: 500 });
        }
    }
    // --- Handle POST requests from the form (to generate the proxy link) ---
    else if (method === "POST" && url.pathname === "/connect") {
        try {
            const formData = await req.formData();
            const vlessUrlInput = formData.get("vless_server_url") as string;

            if (vlessUrlInput && (vlessUrlInput.startsWith("wss://") || vlessUrlInput.startsWith("ws://"))) {
                // Construct the full WebSocket proxy URL for the user's VLESS client
                // This URL will point back to this Deno Deploy app, with the target VLESS server
                // encoded as a query parameter.
                const wsConnectUrl = new URL(url.origin); // Get the base URL of this Deno Deploy app
                wsConnectUrl.searchParams.set("vlessUrl", encodeURIComponent(vlessUrlInput));
                // Optionally, you could add a specific path here if you want to distinguish
                // WebSocket proxy connections from other requests, e.g., wsConnectUrl.pathname = "/ws";

                const generatedHtml = `
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>VLESS Proxy Link Generated</title>
                        <style>
                            body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background-color: #f4f4f4; color: #333; text-align: center; }
                            .container { background-color: #fff; padding: 40px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1); max-width: 600px; }
                            h1 { color: #0056b3; margin-bottom: 20px; }
                            p { line-height: 1.6; margin-bottom: 15px; }
                            .url-box { background-color: #e9e9e9; padding: 15px; border-radius: 5px; word-break: break-all; margin-top: 20px; font-weight: bold; }
                            button { background-color: #28a745; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-size: 1em; margin-top: 15px; transition: background-color 0.3s ease; }
                            button:hover { background-color: #218838; }
                            a { color: #007bff; text-decoration: none; }
                            a:hover { text-decoration: underline; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h1>VLESS Proxy Link Generated!</h1>
                            <p>Copy the URL below and paste it into your VLESS client's WebSocket configuration:</p>
                            <div class="url-box" id="proxyUrl">${wsConnectUrl.toString()}</div>
                            <button onclick="copyToClipboard()">Copy URL</button>
                            <p class="note">
                                Your VLESS client needs to initiate a **WebSocket (WSS)** connection to this URL.
                                This service will then proxy the traffic to your specified VLESS server.
                            </p>
                            <p><a href="/">Go back to home</a></p>
                        </div>
                        <script>
                            function copyToClipboard() {
                                const urlText = document.getElementById('proxyUrl').textContent;
                                // Using document.execCommand('copy') for broader iframe compatibility
                                const textarea = document.createElement('textarea');
                                textarea.value = urlText;
                                document.body.appendChild(textarea);
                                textarea.select();
                                try {
                                    document.execCommand('copy');
                                    alert('URL copied to clipboard!');
                                } catch (err) {
                                    console.error('Failed to copy text: ', err);
                                    alert('Failed to copy URL. Please copy it manually.');
                                }
                                document.body.removeChild(textarea);
                            }
                        </script>
                    </body>
                    </html>
                `;
                return new Response(generatedHtml, {
                    headers: { "Content-Type": "text/html; charset=utf-8" },
                    status: 200
                });

            } else {
                return new Response("Invalid VLESS server URL provided. Must start with 'wss://' or 'ws://'.", { status: 400 });
            }
        } catch (error) {
            console.error("Form submission error:", error);
            return new Response(`Error processing form: ${error.message}`, { status: 500 });
        }
    }
    // --- Handle GET requests for the home page ---
    else if (method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        // Serve a simple HTML home page with an input form
        const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dynamic VLESS Proxy</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background-color: #f4f4f4;
            color: #333;
            text-align: center;
        }
        .container {
            background-color: #fff;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
            max-width: 600px;
        }
        h1 {
            color: #0056b3;
            margin-bottom: 20px;
        }
        p {
            line-height: 1.6;
            margin-bottom: 15px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: bold;
        }
        input[type="text"] {
            width: calc(100% - 20px);
            padding: 10px;
            margin-bottom: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 1em;
        }
        button {
            background-color: #007bff;
            color: white;
            padding: 12px 25px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 1.1em;
            transition: background-color 0.3s ease;
        }
        button:hover {
            background-color: #0056b3;
        }
        .note {
            font-size: 0.9em;
            color: #666;
            margin-top: 20px;
        }
        a {
            color: #007bff;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Welcome to Your Dynamic Proxy Service!</h1>
        <p>Enter the WebSocket URL of your VLESS server below to generate a connection URL for your client.</p>
        
        <form action="/connect" method="POST">
            <div class="form-group">
                <label for="vless_server_url">VLESS Server WebSocket URL:</label>
                <input type="text" id="vless_server_url" name="vless_server_url" 
                       placeholder="e.g., wss://your-vless-server.com/your-path" 
                       value="${VLESS_SERVER_WS_URL_DEFAULT}" required>
            </div>
            <button type="submit">Generate VLESS Proxy Link</button>
        </form>

        <p class="note">
            This service acts as a **WebSocket (WSS)** proxy. After generating the link, 
            you will use that link in your VLESS client's WebSocket configuration.
            It will NOT work with raw TCP connections.
        </p>
    </div>
</body>
</html>
        `;
        return new Response(htmlContent, {
            headers: {
                "Content-Type": "text/html; charset=utf-8",
            },
            status: 200,
        });
    } else {
        // For any other non-WebSocket, non-home page request, return a 404 Not Found
        return new Response("Not Found", { status: 404 });
    }
}

serve(handler);
