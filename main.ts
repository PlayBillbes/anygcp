import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// Read the VLESS server URL from an environment variable
// Provide a fallback or throw an error if it's not set
const VLESS_SERVER_WS_URL = Deno.env.get("VLESS_SERVER_URL") || 'wss://p01--kmkls--lvl2l4gkm4y9.code.run';

if (!VLESS_SERVER_WS_URL) {
    console.error("VLESS_SERVER_URL environment variable is not set. Exiting.");
    // In a real Deno Deploy app, it might just fail at runtime if a request comes in.
    // For robustness, you might want to prevent the server from starting or handle this gracefully.
    // For now, we'll let it proceed, but the WebSocket part will fail.
}

async function handler(req: Request): Promise<Response> {
    const upgrade = req.headers.get("upgrade") || "";
    const url = new URL(req.url); // Parse URL for path handling

    // Serve Home Page for root or index.html
    if (url.pathname === "/" || url.pathname === "/index.html") {
        const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to Your Proxy Service</title>
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
        .contact-info {
            margin-top: 30px;
            font-size: 0.9em;
            color: #666;
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
        <h1>Welcome!</h1>
        <p>This service acts as a secure WebSocket proxy.</p>
        <p>For proxy clients, please ensure your application is configured to connect to this endpoint via WebSocket.</p>
        <p>This is a backend service primarily. For more information or support, please contact the service administrator.</p>
        <div class="contact-info">
            <p>Thank you for using our service!</p>
        </div>
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
        }

    // Handle WebSocket upgrade requests
    if (upgrade.toLowerCase() === "websocket") {
        if (!VLESS_SERVER_WS_URL) {
            console.error("WebSocket connection attempted but VLESS_SERVER_URL is not configured.");
            return new Response("Service misconfigured: VLESS server URL missing.", { status: 503 });
        }

        try {
            // Upgrade incoming request to a WebSocket connection
            const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);

            // Establish a WebSocket connection to your VLESS server
            const vlessServerSocket = new WebSocket(VLESS_SERVER_WS_URL);

            // Event listener for when the VLESS server WebSocket opens
            vlessServerSocket.onopen = () => {
                console.log("Connected to VLESS server via WebSocket.");
            };

            // Event listener for messages from the client
            clientSocket.onmessage = (event) => {
                // Forward client message to the VLESS server
                if (vlessServerSocket.readyState === WebSocket.OPEN) {
                    vlessServerSocket.send(event.data);
                }
            };

            // Event listener for messages from the VLESS server
            vlessServerSocket.onmessage = (event) => {
                // Forward VLESS server message to the client
                if (clientSocket.readyState === WebSocket.OPEN) {
                    clientSocket.send(event.data);
                }
            };

            // Handle closing and errors for both sockets
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

            return response; // Return the response to complete the WebSocket handshake
        } catch (error) {
            console.error("WebSocket upgrade failed:", error);
            return new Response("WebSocket upgrade failed", { status: 500 });
        }
    } else {
        // For any other non-WebSocket, non-home page path, return a 404 Not Found
        return new Response("Not Found", { status: 404 });
    }
}

serve(handler);
