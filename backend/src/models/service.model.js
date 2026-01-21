import mongoose, { model, Schema } from "mongoose";

const ServiceSchema = new Schema(
    {
        technician: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Customer",
            required: true
        },
        
    },
    {
        timestamps: true
    }
)

const Service = model("Service", ServiceSchema)
export default Service