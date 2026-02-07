import Tesseract from 'tesseract.js';
import sharp from 'sharp';
import { CREDITS_CONFIG } from '../config/credits.config.js';

/**
 * Extract payment details from Bankak transaction screenshot using OCR
 * @param {Buffer} imageBuffer - Image buffer from upload
 * @returns {Promise<Object>} Extracted payment details
 */
export const extractPaymentDetails = async (imageBuffer) => {
    try {
        // Preprocess image for better OCR results
        const processedImage = await sharp(imageBuffer)
            .greyscale() // Convert to grayscale
            .normalize() // Enhance contrast
            .sharpen() // Sharpen text
            .toBuffer();

        // Perform OCR based on configured provider
        let ocrResult;

        if (CREDITS_CONFIG.OCR.provider === 'google_vision' && CREDITS_CONFIG.OCR.google_vision.enabled) {
            ocrResult = await extractWithGoogleVision(processedImage);
        } else {
            // Default to Tesseract
            ocrResult = await extractWithTesseract(processedImage);
        }

        return ocrResult;
    } catch (error) {
        console.error('Error extracting payment details:', error);
        throw new Error('فشل في قراءة الصورة');
    }
};

/**
 * Extract text using Tesseract OCR
 * @param {Buffer} imageBuffer
 * @returns {Promise<Object>}
 */
const extractWithTesseract = async (imageBuffer) => {
    const { data } = await Tesseract.recognize(
        imageBuffer,
        CREDITS_CONFIG.OCR.tesseract.language,
        {
            logger: (m) => {
                if (m.status === 'recognizing text') {
                    console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
                }
            },
        }
    );

    const text = data.text;
    console.log('Extracted OCR Text:', text);

    // Parse the extracted text
    return parsePaymentText(text, data.confidence / 100);
};

/**
 * Extract text using Google Cloud Vision API (ready for future implementation)
 * @param {Buffer} imageBuffer
 * @returns {Promise<Object>}
 */
const extractWithGoogleVision = async (imageBuffer) => {
    try {
        const vision = require('@google-cloud/vision');

        // Initialize client with API key if available, otherwise use keyFilename
        const clientConfig = {};
        if (process.env.GOOGLE_VISION_API_KEY) {
            clientConfig.credentials = {
                apiKey: process.env.GOOGLE_VISION_API_KEY
            };
        } else if (process.env.GOOGLE_VISION_KEY_PATH) {
            clientConfig.keyFilename = process.env.GOOGLE_VISION_KEY_PATH;
        } else {
            throw new Error('Google Vision API credentials not configured');
        }

        const client = new vision.ImageAnnotatorClient(clientConfig);

        // Perform text detection
        const [result] = await client.textDetection(imageBuffer);
        const detections = result.textAnnotations;

        if (!detections || detections.length === 0) {
            console.log('No text detected in image by Google Vision');
            return parsePaymentText('', 0);
        }

        const text = detections[0]?.description || '';
        console.log('Extracted OCR Text (Google Vision):', text);

        // Calculate confidence (Google Vision provides per-word confidence)
        // We'll use average confidence from all detections
        let totalConfidence = 0;
        let count = 0;
        for (let i = 1; i < detections.length; i++) { // Skip first one as it's full text
            if (detections[i].confidence !== undefined) {
                totalConfidence += detections[i].confidence;
                count++;
            }
        }
        const averageConfidence = count > 0 ? totalConfidence / count : 0.85; // Default to 0.85 if no confidence

        // Parse the extracted text
        return parsePaymentText(text, averageConfidence);
    } catch (error) {
        console.error('Error using Google Vision API:', error.message);
        // Fallback to Tesseract if Google Vision fails
        console.log('Falling back to Tesseract OCR...');
        return await extractWithTesseract(imageBuffer);
    }
};

/**
 * Parse payment details from OCR text
 * @param {string} text - OCR extracted text
 * @param {number} confidence - OCR confidence score (0-1)
 * @returns {Object} Parsed payment details
 */
const parsePaymentText = (text, confidence) => {
    const details = {
        amount: null,
        transactionId: null,
        recipient: null,
        recipientAccount: null,
        date: null,
        confidence: confidence,
        rawText: text,
    };

    // Extract amount (look for patterns like "140000.00" or "140000")
    const amountPatterns = [
        /Amount[:\s]+(\d+(?:\.\d{2})?)/i,
        /المبلغ[:\s]+(\d+(?:\.\d{2})?)/,
        /(?:^|\s)(\d{5,}(?:\.\d{2})?)\s*(?:SDG|ج\.س)?/m,
    ];

    for (const pattern of amountPatterns) {
        const match = text.match(pattern);
        if (match) {
            details.amount = parseFloat(match[1]);
            break;
        }
    }

    // Extract transaction ID (look for patterns like "20506277311")
    const transactionIdPatterns = [
        /Trx[.\s]*ID[:\s]+(\d+)/i,
        /رقم العملية[:\s]+(\d+)/,
        /(?:^|\s)(\d{10,13})(?:\s|$)/m,
    ];

    for (const pattern of transactionIdPatterns) {
        const match = text.match(pattern);
        if (match) {
            details.transactionId = match[1];
            break;
        }
    }

    // Extract recipient account number (look for "0033 0911 4708 0001" or "1003 0819 8487 0001")
    const accountPatterns = [
        /To[:\s]+(\d{4}\s*\d{4}\s*\d{4}\s*\d{4})/i,
        /إلى[:\s]+(\d{4}\s*\d{4}\s*\d{4}\s*\d{4})/,
        /إلى حساب[:\s]+(\d{4}\s*\d{4}\s*\d{4}\s*\d{4})/,
        /(?:^|\s)(\d{4}\s*\d{4}\s*\d{4}\s*\d{4})(?:\s|$)/m,
    ];

    for (const pattern of accountPatterns) {
        const match = text.match(pattern);
        if (match) {
            // Remove spaces and store
            details.recipientAccount = match[1].replace(/\s/g, '');
            break;
        }
    }

    // Extract recipient name (look for "To Account Title" or similar)
    const namePatterns = [
        /To Account Title[:\s]+(.+?)(?:\n|$)/i,
        /إسم المرسل اليه[:\s]+(.+?)(?:\n|$)/,
        /المرسل اليه[:\s]+(.+?)(?:\n|$)/,
    ];

    for (const pattern of namePatterns) {
        const match = text.match(pattern);
        if (match) {
            details.recipient = match[1].trim();
            break;
        }
    }

    // Extract date (look for patterns like "31-Jan-2026 10:05:12")
    const datePatterns = [
        /Date[:\s&]+Time[:\s]+(.+?)(?:\n|$)/i,
        /التاريخ والوقت[:\s]+(.+?)(?:\n|$)/,
        /(\d{1,2}[-\/]\w{3}[-\/]\d{4}\s+\d{1,2}:\d{2}:\d{2})/,
    ];

    for (const pattern of datePatterns) {
        const match = text.match(pattern);
        if (match) {
            details.date = match[1].trim();
            break;
        }
    }

    return details;
};

/**
 * Verify payment amount matches expected amount
 * @param {number} extractedAmount - Amount extracted from OCR
 * @param {number} expectedAmount - Expected payment amount
 * @returns {Object} Verification result
 */
export const verifyPaymentAmount = (extractedAmount, expectedAmount) => {
    if (!extractedAmount) {
        return {
            valid: false,
            message: 'لم يتم العثور على المبلغ في الصورة',
        };
    }

    console.log("extractedAmount", extractedAmount);
    console.log("expectedAmount", expectedAmount);

    const tolerance = expectedAmount * CREDITS_CONFIG.VERIFICATION.amount_tolerance;
    const difference = Math.abs(extractedAmount - expectedAmount);

    if (difference > tolerance) {
        return {
            valid: false,
            message: `المبلغ المستخرج (${extractedAmount}) لا يطابق المبلغ المطلوب (${expectedAmount})`,
        };
    }

    return {
        valid: true,
        message: 'المبلغ صحيح',
    };
};

/**
 * Verify recipient account matches business account
 * @param {string} extractedAccount - Account number extracted from OCR
 * @returns {Object} Verification result
 */
export const verifyRecipientAccount = (extractedAccount) => {
    if (!extractedAccount) {
        return {
            valid: false,
            message: 'لم يتم العثور على رقم الحساب في الصورة',
        };
    }

    console.log("extractedAccount", extractedAccount);
    console.log("normalizedBusiness", CREDITS_CONFIG.BUSINESS_ACCOUNT.number);

    // Remove any spaces or special characters for comparison
    const normalizedExtracted = extractedAccount.replace(/[\s-]/g, '');
    const normalizedBusiness = CREDITS_CONFIG.BUSINESS_ACCOUNT.number.replace(/[\s-]/g, '');

    if (normalizedExtracted !== normalizedBusiness) {
        return {
            valid: false,
            message: `رقم الحساب المستلم (${extractedAccount}) لا يطابق حساب النشاط التجاري`,
        };
    }

    return {
        valid: true,
        message: 'رقم الحساب صحيح',
    };
};

/**
 * Verify recipient name matches business account owner
 * @param {string} extractedName - Name extracted from OCR
 * @returns {Object} Verification result
 */
export const verifyRecipientName = (extractedName) => {
    console.log(extractedName);
    if (!extractedName) {
        return {
            valid: false, // Name is optional
            message: 'لم يتم العثور على اسم المستلم',
        };
    }

    // Normalize for comparison (lowercase, remove extra spaces)
    const normalizedExtracted = extractedName.toLowerCase().trim().replace(/\s+/g, ' ');

    // Check against name variations
    const isMatch = CREDITS_CONFIG.BUSINESS_ACCOUNT.name_variations.some(variation => {
        const normalizedVariation = variation.toLowerCase().trim().replace(/\s+/g, ' ');
        return normalizedExtracted.includes(normalizedVariation) ||
            normalizedVariation.includes(normalizedExtracted);
    });

    console.log("isMatch", isMatch);
    if (!isMatch) {
        return {
            valid: false,
            message: `اسم المستلم (${extractedName}) لا يطابق حساب النشاط التجاري`,
            warning: true, // This is a warning, not a hard failure
        };
    }

    return {
        valid: true,
        message: 'اسم المستلم صحيح',
    };
};

/**
 * Detect potential image manipulation
 * @param {Buffer} imageBuffer - Original image buffer
 * @returns {Promise<Object>} Detection result
 */
export const detectImageManipulation = async (imageBuffer) => {
    try {
        // Get image metadata
        const metadata = await sharp(imageBuffer).metadata();

        const warnings = [];

        // Check if image has been edited (look for common editing software in EXIF)
        if (metadata.exif) {
            const exifBuffer = metadata.exif;
            const exifString = exifBuffer.toString('utf-8', 0, Math.min(exifBuffer.length, 500));

            const editingSoftware = ['photoshop', 'gimp', 'paint', 'editor', 'modified'];
            const hasEditingSoftware = editingSoftware.some(software =>
                exifString.toLowerCase().includes(software)
            );

            if (hasEditingSoftware) {
                warnings.push('الصورة تحتوي على آثار تعديل');
            }
        }

        // Check image quality (very low quality might indicate screenshot of screenshot)
        if (metadata.density && metadata.density < 72) {
            warnings.push('جودة الصورة منخفضة جداً');
        }

        return {
            suspicious: warnings.length > 0,
            warnings: warnings,
            metadata: {
                format: metadata.format,
                width: metadata.width,
                height: metadata.height,
                hasExif: !!metadata.exif,
            },
        };
    } catch (error) {
        console.error('Error detecting image manipulation:', error);
        return {
            suspicious: false,
            warnings: [],
            error: 'فشل في فحص الصورة',
        };
    }
};

/**
 * Complete payment verification workflow
 * @param {Buffer} imageBuffer - Payment proof image
 * @param {number} expectedAmount - Expected payment amount
 * @returns {Promise<Object>} Complete verification result
 */
export const verifyPaymentProof = async (imageBuffer, expectedAmount) => {
    try {
        // Extract payment details using OCR
        const extracted = await extractPaymentDetails(imageBuffer);

        // Check OCR confidence
        if (extracted.confidence < CREDITS_CONFIG.VERIFICATION.min_confidence) {
            return {
                success: false,
                message: 'جودة الصورة منخفضة. يرجى تحميل صورة أوضح',
                extracted,
                verifications: {},
            };
        }

        // Verify amount
        const amountVerification = verifyPaymentAmount(extracted.amount, expectedAmount);

        // Verify recipient account
        const accountVerification = verifyRecipientAccount(extracted.recipientAccount);

        // Verify recipient name (optional)
        const nameVerification = verifyRecipientName(extracted.recipient);

        // Detect manipulation
        const manipulationCheck = await detectImageManipulation(imageBuffer);

        const verifications = {
            amount: amountVerification,
            account: accountVerification,
            name: nameVerification,
            manipulation: manipulationCheck,
        };

        // Determine if verification passed
        const allValid = amountVerification.valid && accountVerification.valid;
        const hasWarnings = !nameVerification.valid || manipulationCheck.suspicious || !accountVerification.valid;

        return {
            success: allValid,
            requiresManualReview: hasWarnings,
            message: allValid
                ? (hasWarnings ? 'تم التحقق مع وجود تحذيرات. يتطلب مراجعة يدوية' : 'تم التحقق بنجاح')
                : 'فشل التحقق من الدفع',
            extracted,
            verifications,
        };
    } catch (error) {
        console.error('Error verifying payment proof:', error);
        return {
            success: false,
            message: error.message || 'خطأ في التحقق من إثبات الدفع',
            extracted: null,
            verifications: {},
        };
    }
};
