const express = require("express")
const crypto = require("crypto")
const net = require("net")
const Link = require("../models/link")
const ClickEvent = require("../models/clickEvent")
const WhitelistIp = require("../models/whitelistIp")

const router = express.Router()

const VALID_SLUG_REGEX = /^[a-z0-9-]{4,64}$/
function generateSlug(length = 8) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
  const bytes = crypto.randomBytes(length)

  let slug = ""
  for (let index = 0; index < length; index += 1) {
    slug += alphabet[bytes[index] % alphabet.length]
  }

  return slug
}

function isValidUrl(value) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch (error) {
    return false
  }
}

function buildWrappedUrl(slug) {
  const base = process.env.BASE_TRACKING_URL || ""
  return `${base.replace(/\/$/, "")}/r/${slug}`
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

router.post("/links", async (req, res, next) => {
  try {
    const { name, targetUrl, slug } = req.body

    if (!name || !targetUrl) {
      return res.status(400).json({
        message: "name and targetUrl are required",
      })
    }

    if (!isValidUrl(targetUrl)) {
      return res.status(400).json({
        message: "targetUrl must be a valid http/https URL",
      })
    }

    const finalSlug = (slug || generateSlug()).toLowerCase()
    if (!VALID_SLUG_REGEX.test(finalSlug)) {
      return res.status(400).json({
        message: "slug must match [a-z0-9-] with length 4 to 64",
      })
    }

    const existing = await Link.findOne({ slug: finalSlug }).lean()
    if (existing) {
      return res.status(409).json({
        message: "slug already exists",
      })
    }

    const link = await Link.create({
      name,
      targetUrl,
      slug: finalSlug,
    })

    return res.status(201).json({
      id: link._id,
      name: link.name,
      targetUrl: link.targetUrl,
      slug: link.slug,
      clickCount: link.clickCount,
      lastClickedAt: link.lastClickedAt,
      createdAt: link.createdAt,
      wrappedUrl: buildWrappedUrl(link.slug),
    })
  } catch (error) {
    return next(error)
  }
})

router.get("/links", async (req, res, next) => {
  try {
    const links = await Link.find().sort({ createdAt: -1 }).lean()
    const payload = links.map((link) => ({
      id: link._id,
      name: link.name,
      targetUrl: link.targetUrl,
      slug: link.slug,
      clickCount: link.clickCount,
      lastClickedAt: link.lastClickedAt,
      createdAt: link.createdAt,
      wrappedUrl: buildWrappedUrl(link.slug),
    }))

    return res.json(payload)
  } catch (error) {
    return next(error)
  }
})

router.get("/links/:id/events", async (req, res, next) => {
  try {
    const { id } = req.params
    const limit = Math.min(Number(req.query.limit) || 30, 100)

    const link = await Link.findById(id).lean()
    if (!link) {
      return res.status(404).json({ message: "Link not found" })
    }

    const events = await ClickEvent.find({ linkId: id })
      .sort({ clickedAt: -1 })
      .limit(limit)
      .lean()

    return res.json({
      link: {
        id: link._id,
        name: link.name,
        slug: link.slug,
        wrappedUrl: buildWrappedUrl(link.slug),
      },
      events: events.map((event) => ({
        id: event._id,
        clickedAt: event.clickedAt,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        referer: event.referer,
      })),
    })
  } catch (error) {
    return next(error)
  }
})

router.delete("/links/:id", async (req, res, next) => {
  try {
    const { id } = req.params
    const link = await Link.findById(id).lean()

    if (!link) {
      return res.status(404).json({ message: "Link not found" })
    }

    await Promise.all([
      Link.deleteOne({ _id: id }),
      ClickEvent.deleteMany({ linkId: id }),
    ])

    return res.json({
      message: "Link deleted successfully",
      id,
    })
  } catch (error) {
    return next(error)
  }
})

router.get("/whitelist-ips", async (req, res, next) => {
  try {
    const items = await WhitelistIp.find().sort({ createdAt: -1 }).lean()
    return res.json(
      items.map((item) => ({
        id: item._id,
        ipAddress: item.ipAddress,
        note: item.note,
        createdAt: item.createdAt,
      })),
    )
  } catch (error) {
    return next(error)
  }
})

router.post("/whitelist-ips", async (req, res, next) => {
  try {
    const { ipAddress, note } = req.body
    const normalizedIp = normalizeIpAddress(String(ipAddress || "").trim())

    if (!normalizedIp || net.isIP(normalizedIp) === 0) {
      return res.status(400).json({
        message: "ipAddress must be a valid IPv4/IPv6 address",
      })
    }

    const existing = await WhitelistIp.findOne({
      ipAddress: normalizedIp,
    }).lean()
    if (existing) {
      return res.status(409).json({ message: "IP address already whitelisted" })
    }

    const created = await WhitelistIp.create({
      ipAddress: normalizedIp,
      note: String(note || "").trim(),
    })

    return res.status(201).json({
      id: created._id,
      ipAddress: created.ipAddress,
      note: created.note,
      createdAt: created.createdAt,
    })
  } catch (error) {
    return next(error)
  }
})

router.delete("/whitelist-ips/:id", async (req, res, next) => {
  try {
    const { id } = req.params
    const result = await WhitelistIp.deleteOne({ _id: id })

    if (!result.deletedCount) {
      return res.status(404).json({ message: "Whitelist IP not found" })
    }

    return res.json({
      message: "Whitelist IP deleted successfully",
      id,
    })
  } catch (error) {
    return next(error)
  }
})

module.exports = router
