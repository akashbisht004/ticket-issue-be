
import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
} from "@whiskeysockets/baileys";

import qrcode from "qrcode-terminal";
import { mkdir } from "node:fs/promises";

let sock = null;
let connectionStatus = "disconnected";
let reconnectTimer = null;
let starting = false;

export async function startWhatsApp() {
    // Prevent multiple simultaneous connection attempts
    if (starting || (sock && connectionStatus !== "disconnected")) {
        return;
    }

    starting = true;

    try {
        const authDir =
            process.env.WHATSAPP_AUTH_DIR || "./auth_info_baileys";

        await mkdir(authDir, { recursive: true });

        const { state, saveCreds } = await useMultiFileAuthState(authDir);

        sock = makeWASocket({
            auth: state,
            markOnlineOnConnect: false,
        });

        sock.ev.on("creds.update", saveCreds);

        sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
            if (qr) {
                console.log("WHATSAPP_QR_START");
                console.log(qr);
                console.log("WHATSAPP_QR_END");
            }

            if (connection === "connecting") {
                connectionStatus = "connecting";
                console.log("Connecting to WhatsApp...");
            }

            if (connection === "open") {
                connectionStatus = "connected";
                console.log("WhatsApp connected successfully!");
            }

            if (connection === "close") {
                connectionStatus = "disconnected";
                sock = null;

                const statusCode =
                    lastDisconnect?.error?.output?.statusCode;

                console.log("WhatsApp connection closed:", statusCode);

                if (statusCode === DisconnectReason.loggedOut) {
                    console.log(
                        "WhatsApp logged out. A fresh QR scan is required."
                    );
                    return;
                }

                console.log("Reconnecting to WhatsApp in 5 seconds...");

                if (reconnectTimer) {
                    clearTimeout(reconnectTimer);
                }

                reconnectTimer = setTimeout(() => {
                    reconnectTimer = null;
                    startWhatsApp().catch((error) => {
                        console.error("WhatsApp reconnect failed:", error);
                    });
                }, 5000);
            }
        });
    } catch (error) {
        sock = null;
        connectionStatus = "disconnected";
        console.error("WhatsApp initialization failed:", error);

        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
        }

        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            startWhatsApp().catch(console.error);
        }, 5000);
    } finally {
        starting = false;
    }
}

export async function sendGroupMessage(groupId, message) {
    if (!sock || connectionStatus !== "connected") {
        throw new Error("WhatsApp is not connected");
    }

    if (!groupId.endsWith("@g.us")) {
        throw new Error("Invalid WhatsApp group ID");
    }

    const groups = await sock.groupFetchAllParticipating();

    if (!groups[groupId]) {
        throw new Error(
            "Group not found or account is not a participant"
        );
    }

    return await sock.sendMessage(groupId, {
        text: message,
    });
}

export function getWhatsAppSocket() {
    return sock;
}

export function getWhatsAppStatus() {
    return connectionStatus;
}
