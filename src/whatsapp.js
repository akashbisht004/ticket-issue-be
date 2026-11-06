
import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
} from "@whiskeysockets/baileys";

import qrcode from "qrcode-terminal";

let sock = null;
let connectionStatus = "disconnected";

export async function startWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(
        "./auth_info_baileys"
    );

    sock = makeWASocket({
        auth: state,
        markOnlineOnConnect: false,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {

        // Display QR code when authentication is required
        if (qr) {
            console.log("\nScan this QR code using WhatsApp:\n");
            qrcode.generate(qr, { small: true });
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

            const statusCode =
                lastDisconnect?.error?.output?.statusCode;

            console.log("Connection closed:", statusCode);

            if (statusCode === DisconnectReason.loggedOut) {
                console.log("Logged out. Please authenticate again.");
                return;
            }

            console.log("Attempting to reconnect...");
            setTimeout(() => startWhatsApp(), 3000);
        }
    });
}


export async function sendGroupMessage(groupId, message) {
    if (!sock || connectionStatus !== "connected") {
        throw new Error("WhatsApp is not connected");
    }

    if (!groupId.endsWith("@g.us")) {
        throw new Error("Invalid WhatsApp group ID");
    }

    // Verify that the account belongs to this group
    const groups = await sock.groupFetchAllParticipating();

    if (!groups[groupId]) {
        throw new Error("Group not found or account is not a participant");
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
