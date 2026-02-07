import multer from 'multer';
import { CREDITS_CONFIG } from '../config/credits.config.js';

// Configure multer for memory storage (process images in memory)
const storage = multer.memoryStorage();

// File filter to only allow images
const fileFilter = (req, file, cb) => {
    if (CREDITS_CONFIG.UPLOAD.allowed_mime_types.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('نوع الملف غير مدعوم. يرجى تحميل صورة بصيغة JPG أو PNG'), false);
    }
};

// Create multer upload middleware
export const uploadPaymentProof = multer({
    storage: storage,
    limits: {
        fileSize: CREDITS_CONFIG.UPLOAD.max_file_size,
    },
    fileFilter: fileFilter,
}).single('paymentProof'); // Field name for payment proof image

// Error handling middleware for multer errors
export const handleUploadError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                message: 'حجم الملف كبير جداً. الحد الأقصى 5 ميجابايت',
            });
        }
        return res.status(400).json({
            message: 'خطأ في تحميل الملف',
        });
    } else if (err) {
        return res.status(400).json({
            message: err.message || 'خطأ في تحميل الملف',
        });
    }
    next();
};
