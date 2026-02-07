/**
 * Credits System Configuration
 */

export const CREDITS_CONFIG = {
    // Official Bankak business account for receiving payments
    BUSINESS_ACCOUNT: {
        number: "1003081984870001",
        name_arabic: "محمدالمنتصر يحي حسين صالح",
        name_english: "C Mohamedalmontaser Yahya Hussain Salih",
        // Normalized variations for OCR matching
        name_variations: [
            "محمدالمنتصر يحي حسين صالح",
            "محمد المنتصر يحي حسين صالح",
            "mohamedalmontaser yahya hussain salih",
            "c mohamedalmontaser yahya hussain salih",
            "فاطمه صالح ماحي صالح" // From the screenshot
        ]
    },

    // Credits deducted per request acceptance
    CREDITS_PER_REQUEST: 5,

    // OCR Configuration
    OCR: {
        // Current provider: 'tesseract' or 'google_vision'
        provider: 'google_vision',

        // Google Cloud Vision API configuration (ready for future use)
        google_vision: {
            enabled: true,
            api_key: process.env.GOOGLE_VISION_API_KEY || '',
        },

        // Tesseract configuration
        tesseract: {
            enabled: true,
            language: 'ara+eng', // Arabic + English
        }
    },

    // Payment verification settings
    VERIFICATION: {
        // Allow amount tolerance (e.g., 0.01 = 1% difference allowed)
        amount_tolerance: 0.01,

        // Minimum confidence score for OCR results (0-1)
        min_confidence: 0.6,

        // Auto-approve purchases below this amount (set to 0 to disable)
        auto_approve_threshold: 0,
    },

    // File upload limits
    UPLOAD: {
        max_file_size: 5 * 1024 * 1024, // 5MB
        allowed_mime_types: ['image/jpeg', 'image/jpg', 'image/png'],
    }
};
