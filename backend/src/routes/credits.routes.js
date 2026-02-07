import express from 'express';
import {
    getCreditBalanceController,
    getCreditPackagesController,
    requestCreditPurchaseController,
    getPurchaseHistoryController,
    getPurchaseRequestController,
    verifyCreditPurchaseController,
    getCreditTransactionsController,
} from '../controllers/credits.controllers.js';
import { uploadPaymentProof, handleUploadError } from '../middlewares/upload.middleware.js';
import { AuthMiddleware } from '../middlewares/auth.middleware.js';

const router = express.Router();
router.tim
// All routes require authentication
router.use(AuthMiddleware);

// Get current credit balance
router.get('/balance', getCreditBalanceController);

// Get available credit packages
router.get('/packages', getCreditPackagesController);

// Submit payment proof for credit purchase (with file upload)
router.post(
    '/purchase',
    uploadPaymentProof,
    handleUploadError,
    requestCreditPurchaseController
);

// Get purchase history
router.get('/history', getPurchaseHistoryController);

// Get specific purchase request
router.get('/purchase/:id', getPurchaseRequestController);

// Get credit transaction history
router.get('/transactions', getCreditTransactionsController);

// Admin: Manually verify purchase request
// TODO: Add admin middleware
router.put('/purchase/:id/verify', verifyCreditPurchaseController);

export default router;
