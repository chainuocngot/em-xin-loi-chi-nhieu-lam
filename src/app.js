const express = require("express")
const cors = require("cors")
const dotenv = require("dotenv")
const morgan = require("morgan")
const { connectToDatabase } = require("./db")
const linkRoutes = require("./routes/links")
const redirectRoutes = require("./routes/redirect")

dotenv.config()

const app = express()

const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
}

app.use(cors(corsOptions))
app.options(/.*/, cors(corsOptions))
app.use(express.json())
app.use(morgan("dev"))

app.get("/api/health", async (req, res, next) => {
  try {
    await connectToDatabase()
    return res.json({
      ok: true,
      now: new Date().toISOString(),
    })
  } catch (error) {
    return next(error)
  }
})

app.use(async (req, res, next) => {
  try {
    await connectToDatabase()
    return next()
  } catch (error) {
    return next(error)
  }
})

app.use("/api", linkRoutes)
app.use(redirectRoutes)

app.use((req, res) => {
  return res.status(404).json({
    message: "Not found",
  })
})

app.use((error, req, res, next) => {
  console.error(error)
  return res.status(500).json({
    message: "Internal server error",
  })
})

module.exports = app
