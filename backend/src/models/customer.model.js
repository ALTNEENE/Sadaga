import mongoose from 'mongoose'
import { RoleEnum } from '../utils/enums.js'
import { compare, hash } from 'bcrypt'


const CustomerSchema = new mongoose.Schema(
    {
        latitude: {
            type: Number,
            default: null
        },
        longitude: {
            type: Number,
            default: null
        },
        name: {
            type: String,
            required: true,
        },

        email: {
            type: String,
            required: true,
            unique: true
        },
        role: {
            type: String,
            enum: RoleEnum,
            default: "USER",
            required: true

        },
        profession: {
            type: String,
            default: ""
        },
        phone: {
            type: String,
            required: true,
        },
        password: {
            type: String,
            required: true,
            limit: [8, "Enter at least 8 chars"]
        },
        isActive: { type: Boolean, default: false },
        lastLogin: { type: Date, default: null },
    },
    {
        timestamps: true
    }
)

CustomerSchema.pre("save", function () {
    if (this.isModified("password")) {
        if (this.password) {
            this.password = hash(this.password, 10)
        }
    }
})

CustomerSchema.methods.comparePassword = function (password) {
    return compare(password, this.password)
}

const Customer = mongoose.model("Customer", CustomerSchema)

export default Customer