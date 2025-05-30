import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// This will now be a placeholder. The actual URL will come from user input.
// We keep it as a default or for cases where input isn't provided.
let VLESS_SERVER_WS_URL_DEFAULT = "wss://your-default-vless-server.com/your-default-path"; 

// Consider loading this default from an environment variable for easier management
// For example: Deno.env.get("DEFAULT_VLESS_URL") || "wss://default.com/path";
// To use environment variables, you'll need to set them in your Deno Deploy project settings.

async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const upgrade = req.headers.get("upgrade") || "";
    const method = req.method;

    // Handle WebSocket upgrade requests
    if (upgrade.toLowerCase() === "websocket") {
        // Get the VLESS server URL from query parameter or default
        const targetVlessUrl = url.searchParams.get("vlessUrl") || VLESS_SERVER_WS_URL_DEFAULT;
        
        // Basic validation (optional, but good practice)
        if (!targetVlessUrl.startsWith("wss://")) {
             return new Response("Invalid VLESS server URL. Must start with wss://", { status: 400 });
        }

        try {
            console.log(`Attempting to proxy WebSocket to: ${targetVlessUrl}`);
            const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);
            const vlessServerSocket = new WebSocket(targetVlessUrl);

            vlessServerSocket.onopen = () => {
                console.log("Connected to VLESS server via WebSocket.");
            };

            clientSocket.onmessage = (event) => {
                if (vlessServerSocket.readyState === WebSocket.OPEN) {
                    vlessServerSocket.send(event.data);
                }
            };

            vlessServerSocket.onmessage = (event) => {
                if (clientSocket.readyState === WebSocket.OPEN) {
                    clientSocket.send(event.data);
                }
            };

            clientSocket.onclose = () => {
                console.log("Client WebSocket closed.");
                vlessServerSocket.close();
            };
            clientSocket.onerror = (error) => {
                console.error("Client WebSocket error:", error);
                vlessServerSocket.close();
            };

            vlessServerSocket.onclose = () => {
                console.log("VLESS server WebSocket closed.");
                clientSocket.close();
            };
            vlessServerSocket.onerror = (error) => {
                console.error("VLESS server WebSocket error:", error);
                clientSocket.close();
            };

            return response;
        } catch (error) {
            console.error("WebSocket upgrade failed:", error);
            return new Response(`WebSocket upgrade failed: ${error.message}`, { status: 500 });
        }
    } 
    // Handle POST requests from the form
    else if (method === "POST" && url.pathname === "/connect") {
        try {
            const formData = await req.formData();
            const vlessUrlInput = formData.get("vless_server_url") as string;

            if (vlessUrlInput && vlessUrlInput.startsWith("wss://")) {
                // We don't directly establish the WebSocket here because Deno Deploy
                // doesn't support initiating WebSockets from a non-WebSocket request.
                // Instead, we redirect the user to a specific URL that the VLESS client
                // can then use to initiate the WebSocket connection.
                
                // Construct the URL for the WebSocket connection, including the user's input
                const wsConnectUrl = new URL(url.origin); // Get base URL of the Deno Deploy app
                wsConnectUrl.searchParams.set("vlessUrl", encodeURIComponent(vlessUrlInput));
                // You might also add a specific path for the WebSocket if needed, e.g., /ws
                // wsConnectUrl.pathname = "/ws"; 

                // Redirect the browser to a "connection page" or simply output the WebSocket URL
                // For a VLESS client, you'd typically copy this URL and paste it into the client.
                const redirectResponse = `
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Connect to VLESS</title>
                        <style>
                            body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background-color: #f4f4f4; color: #333; text-align: center; }
                            .container { background-color: #fff; padding: 40px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1); max-width: 600px; }
                            h1 { color: #0056b3; margin-bottom: 20px; }
                            p { line-height: 1.6; margin-bottom: 15px; }
                            .url-box { background-color: #e9e9e9; padding: 15px; border-radius: 5px; word-break: break-all; margin-top: 20px; font-weight: bold; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h1>VLESS WebSocket URL Generated!</h1>
                            <p>Copy the URL below and paste it into your VLESS client's WebSocket configuration:</p>
                            <div class="url-box">${wsConnectUrl.toString()}</div>
                            <p>Note: This page itself doesn't connect. Your VLESS client needs to initiate the WebSocket connection.</p>
                            <p><a href="/">Go back to home</a></p>
                        </div>
                    </body>
                    </html>
                `;
                return new Response(redirectResponse, {
                    headers: { "Content-Type": "text/html; charset=utf-8" },
                    status: 200
                });

            } else {
                return new Response("Invalid VLESS server URL provided. Must start with wss://", { status: 400 });
            }
        } catch (error) {
            console.error("Form submission error:", error);
            return new Response(`Error processing form: ${error.message}`, { status: 500 });
        }
    }
    // Handle GET requests for the home page
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
            This service acts as a WebSocket proxy. After generating the link, 
            you will use that link in your VLESS client's WebSocket configuration.
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
