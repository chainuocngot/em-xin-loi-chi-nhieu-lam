const express = require("express")
const Link = require("../models/link")
const ClickEvent = require("../models/clickEvent")
const WhitelistIp = require("../models/whitelistIp")
const { sendDiscordClickNotification } = require("../services/discord")

const router = express.Router()

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"]
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim()
  }

  return req.ip || null
}

function normalizeIpAddress(ipAddress) {
  if (!ipAddress) {
    return ""
  }

  if (ipAddress.startsWith("::ffff:")) {
    return ipAddress.slice(7)
  }

  return ipAddress.toLowerCase()
}

router.get("/r/:slug", async (req, res, next) => {
  try {
    const slug = String(req.params.slug || "").toLowerCase()
    const link = await Link.findOne({ slug })

    if (!link) {
      return res.status(404).json({ message: "Wrapped link not found" })
    }

    const clientIp = normalizeIpAddress(getClientIp(req))
    const isWhitelisted = clientIp
      ? await WhitelistIp.exists({ ipAddress: clientIp })
      : null

    if (isWhitelisted) {
      return res.redirect(302, link.targetUrl)
    }

    const event = await ClickEvent.create({
      linkId: link._id,
      clickedAt: new Date(),
      ipAddress: clientIp || null,
      userAgent: req.get("user-agent") || null,
      referer: req.get("referer") || null,
    })

    await Link.updateOne(
      { _id: link._id },
      {
        $inc: { clickCount: 1 },
        $set: { lastClickedAt: event.clickedAt },
      },
    )

    sendDiscordClickNotification({ link, event }).catch((error) => {
      console.error("Failed to send Discord notification:", error.message)
    })

    return res.redirect(302, link.targetUrl)
  } catch (error) {
    return next(error)
  }
})

module.exports = router
