const mongoose = require("mongoose")

const WhitelistIpSchema = new mongoose.Schema(
  {
    ipAddress: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
      maxlength: 128,
    },
    note: {
      type: String,
      default: "",
      trim: true,
      maxlength: 200,
    },
  },
  {
    timestamps: true,
  },
)

module.exports = mongoose.model("WhitelistIp", WhitelistIpSchema)
