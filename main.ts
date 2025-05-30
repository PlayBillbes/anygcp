import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// Replace with the actual address of your VLESS server that accepts WebSocket connections
const VLESS_SERVER_WS_URL = "ws://47.128.249.85:21835/";

async function handler(req: Request): Promise<Response> {
    const upgrade = req.headers.get("upgrade") || "";

    if (upgrade.toLowerCase() === "websocket") {
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
        // --- START: Added Home Page Logic ---
        // Handle regular HTTP requests (e.g., from a web browser)
        const url = new URL(req.url);

        if (url.pathname === "/" || url.pathname === "/index.html") {
            // Serve a simple HTML home page
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
        <p>This service acts as a secure WebSocket proxy. If you're a client, please ensure your application is configured to connect to this endpoint via WebSocket.</p>
        <p>This is a backend service primarily, and the main functionality is exposed via WebSocket connections. For more information or support, please contact the service administrator.</p>
        <div class="contact-info">
            <p>For technical inquiries, please refer to your service documentation or contact support.</p>
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
        } else {
            // For any other non-WebSocket path, return a 404 Not Found
            return new Response("Not Found", { status: 404 });
        }
        // --- END: Added Home Page Logic ---
    }
}

serve(handler);
