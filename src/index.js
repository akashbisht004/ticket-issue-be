
import "dotenv/config";
import express from "express";
import cors from "cors";

import {
    startWhatsApp,
    getWhatsAppStatus,
    sendGroupMessage,
} from "./whatsapp.js";

const app = express();

// Backend-controlled WhatsApp routing
const PRIORITY_GROUPS = {
    critical: process.env.CRITICAL_GROUP_ID,
    high: process.env.HIGH_GROUP_ID,
    medium: process.env.MEDIUM_GROUP_ID,
};

const severityLevels = ["critical", "high", "medium"];

const tickets = [];

app.disable("x-powered-by");

// Configure CORS for your deployed frontend
const allowedOrigins = (
    process.env.CLIENT_ORIGIN || "http://localhost:5173"
).split(",").map((origin) => origin.trim());

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            callback(new Error("Origin not allowed by CORS"));
        },
    })
);

app.use(express.json({ limit: "20kb" }));

// Health check
app.get("/api/health", (req, res) => {
    res.json({
        server: "running",
        whatsapp: getWhatsAppStatus(),
    });
});

// Create ticket and notify the corresponding WhatsApp group
app.post("/api/tickets", async (req, res) => {
    try {
        const { title, description, severity } = req.body;

        // Validate input
        if (
            typeof title !== "string" ||
            typeof description !== "string" ||
            !title.trim() ||
            !description.trim()
        ) {
            return res.status(400).json({
                error: "Title and description are required",
            });
        }

        if (title.trim().length > 120) {
            return res.status(400).json({
                error: "Title cannot exceed 120 characters",
            });
        }

        if (description.trim().length > 3000) {
            return res.status(400).json({
                error: "Description cannot exceed 3000 characters",
            });
        }

        const priority =
            typeof severity === "string"
                ? severity.trim().toLowerCase()
                : "";

        if (!severityLevels.includes(priority)) {
            return res.status(400).json({
                error: "Priority must be critical, high, or medium",
            });
        }

        // Resolve WhatsApp group internally
        const groupId = PRIORITY_GROUPS[priority];

        if (!groupId) {
            return res.status(503).json({
                error: `WhatsApp group is not configured for ${priority} priority`,
            });
        }

        // Create ticket
        const ticket = {
            id: `TKT-${Date.now()}`,
            title: title.trim(),
            description: description.trim(),
            severity: priority,
            status: "open",
            createdAt: new Date().toISOString(),
            notificationStatus: "pending",
        };

        tickets.unshift(ticket);

        // Send WhatsApp notification
        try {
            await sendGroupMessage(
                groupId,
                [
                    `🎫 NEW TICKET: ${ticket.id}`,
                    `Title: ${ticket.title}`,
                    `Priority: ${ticket.severity.toUpperCase()}`,
                    `Description: ${ticket.description}`,
                    `Status: OPEN`,
                ].join("\n")
            );

            ticket.notificationStatus = "sent";
        } catch (notificationError) {
            console.error("WhatsApp notification failed:", notificationError);

            ticket.notificationStatus = "failed";
            ticket.notificationError = notificationError.message;
        }

        return res.status(201).json({
            success: true,
            ticket,
        });
    } catch (error) {
        console.error("Ticket creation error:", error);

        return res.status(500).json({
            error: "Could not create ticket",
        });
    }
});

// Start server and WhatsApp connection
const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);

    try {
        await startWhatsApp();
    } catch (error) {
        console.error("WhatsApp startup failed:", error);
    }
});
