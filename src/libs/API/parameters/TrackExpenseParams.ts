import type {ValueOf} from 'type-fest';
import type CONST from '@src/CONST';
import type {Receipt} from '@src/types/onyx/Transaction';

type TrackExpenseParams = {
    amount: number;
    currency: string;
    comment: string;
    created: string;
    merchant: string;
    iouReportID?: string;
    chatReportID: string;
    transactionID: string;
    reportActionID: string;
    createdChatReportActionID: string;
    createdExpenseReportActionID?: string;
    reportPreviewReportActionID?: string;
    receipt: Receipt;
    receiptState?: ValueOf<typeof CONST.IOU.RECEIPT_STATE>;
    tag?: string;
    gpsPoints?: string;
    transactionThreadReportID: string;
    createdReportActionIDForThread: string;
};

export default TrackExpenseParams;
