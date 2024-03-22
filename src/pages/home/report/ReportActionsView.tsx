import type {RouteProp} from '@react-navigation/native';
import {useIsFocused, useRoute} from '@react-navigation/native';
import lodashIsEmpty from 'lodash/isEmpty';
import lodashIsEqual from 'lodash/isEqual';
import React, {useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {InteractionManager} from 'react-native';
import {withOnyx} from 'react-native-onyx';
import type {OnyxEntry} from 'react-native-onyx';
import useCopySelectionHelper from '@hooks/useCopySelectionHelper';
import useInitialValue from '@hooks/useInitialValue';
import useNetwork from '@hooks/useNetwork';
import usePrevious from '@hooks/usePrevious';
import useWindowDimensions from '@hooks/useWindowDimensions';
import getIsReportFullyVisible from '@libs/getIsReportFullyVisible';
import type {CentralPaneNavigatorParamList} from '@libs/Navigation/types';
import {generateNewRandomInt} from '@libs/NumberUtils';
import Performance from '@libs/Performance';
import * as ReportActionsUtils from '@libs/ReportActionsUtils';
import {isUserCreatedPolicyRoom} from '@libs/ReportUtils';
import {didUserLogInDuringSession} from '@libs/SessionUtils';
import shouldFetchReport from '@libs/shouldFetchReport';
import {ReactionListContext} from '@pages/home/ReportScreenContext';
import * as Report from '@userActions/Report';
import Timing from '@userActions/Timing';
import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import type SCREENS from '@src/SCREENS';
import type * as OnyxTypes from '@src/types/onyx';
import getInitialPaginationSize from './getInitialPaginationSize';
import PopoverReactionList from './ReactionList/PopoverReactionList';
import ReportActionsList from './ReportActionsList';

type ReportActionsViewOnyxProps = {
    /** Session info for the currently logged in user. */
    session: OnyxEntry<OnyxTypes.Session>;

    /** Array of report actions for the transaction thread report associated with the current report */
    transactionThreadReportActions: OnyxTypes.ReportAction[];

    /** The transaction thread report associated with the current report, if any */
    transactionThreadReport: OnyxEntry<OnyxTypes.Report>;
};

type ReportActionsViewProps = ReportActionsViewOnyxProps & {
    /** The report currently being looked at */
    report: OnyxTypes.Report;

    /** Array of report actions for this report */
    reportActions?: OnyxTypes.ReportAction[];

    /** The report's parentReportAction */
    parentReportAction: OnyxEntry<OnyxTypes.ReportAction>;

    /** The report metadata loading states */
    isLoadingInitialReportActions?: boolean;

    /** The report actions are loading more data */
    isLoadingOlderReportActions?: boolean;

    /** The report actions are loading newer data */
    isLoadingNewerReportActions?: boolean;

    /** Whether the report is ready for comment linking */
    isReadyForCommentLinking?: boolean;
};

const DIFF_BETWEEN_SCREEN_HEIGHT_AND_LIST = 120;
const SPACER = 16;

let listOldID = Math.round(Math.random() * 100);

function ReportActionsView({
    report,
    transactionThreadReport,
    session,
    parentReportAction,
    reportActions: allReportActions = [],
    transactionThreadReportActions = [],
    isLoadingInitialReportActions = false,
    isLoadingOlderReportActions = false,
    isLoadingNewerReportActions = false,
    isReadyForCommentLinking = false,
}: ReportActionsViewProps) {
    useCopySelectionHelper();
    const reactionListRef = useContext(ReactionListContext);
    const route = useRoute<RouteProp<CentralPaneNavigatorParamList, typeof SCREENS.REPORT>>();
    const reportActionID = route?.params?.reportActionID;
    const didLayout = useRef(false);
    const didSubscribeToReportTypingEvents = useRef(false);

    // triggerListID is used when navigating to a chat with messages loaded from LHN. Typically, these include thread actions, task actions, etc. Since these messages aren't the latest,we don't maintain their position and instead trigger a recalculation of their positioning in the list.
    // we don't set currentReportActionID on initial render as linkedID as it should trigger visibleReportActions after linked message was positioned
    const [currentReportActionID, setCurrentReportActionID] = useState('');
    const isFirstLinkedActionRender = useRef(true);

    const network = useNetwork();
    const {isSmallScreenWidth, windowHeight} = useWindowDimensions();
    const contentListHeight = useRef(0);
    const isFocused = useIsFocused();
    const prevNetworkRef = useRef(network);
    const prevAuthTokenType = usePrevious(session?.authTokenType);
    const [isNavigatingToLinkedMessage, setNavigatingToLinkedMessage] = useState(!!reportActionID);
    const prevIsSmallScreenWidthRef = useRef(isSmallScreenWidth);
    const reportID = report.reportID;
    const isLoading = (!!reportActionID && isLoadingInitialReportActions) || !isReadyForCommentLinking;
    const isReportFullyVisible = useMemo((): boolean => getIsReportFullyVisible(isFocused), [isFocused]);
    const openReportIfNecessary = () => {
        if (!shouldFetchReport(report)) {
            return;
        }

        Report.openReport(reportID, reportActionID);
    };

    const reconnectReportIfNecessary = () => {
        if (!shouldFetchReport(report)) {
            return;
        }

        Report.reconnect(reportID);
    };

    useLayoutEffect(() => {
        setCurrentReportActionID('');
    }, [route]);

    const listID = useMemo(() => {
        isFirstLinkedActionRender.current = true;
        const newID = generateNewRandomInt(listOldID, 1, Number.MAX_SAFE_INTEGER);
        listOldID = newID;
        return newID;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [route, isLoadingInitialReportActions]);

    const combinedReportActions = ReportActionsUtils.getCombinedReportActionsForDisplay(allReportActions, transactionThreadReportActions);
    const indexOfLinkedAction = useMemo(() => {
        if (!reportActionID || isLoading) {
            return -1;
        }

        return combinedReportActions.findIndex((obj) => String(obj.reportActionID) === String(isFirstLinkedActionRender.current ? reportActionID : currentReportActionID));
    }, [combinedReportActions, currentReportActionID, reportActionID, isLoading]);

    const reportActions = useMemo(() => {
        if (!reportActionID) {
            return combinedReportActions;
        }

        if (isLoading || indexOfLinkedAction === -1) {
            return [];
        }

        if (isFirstLinkedActionRender.current) {
            return combinedReportActions.slice(indexOfLinkedAction);
        }
        const paginationSize = getInitialPaginationSize;
        return combinedReportActions.slice(Math.max(indexOfLinkedAction - paginationSize, 0));

        // currentReportActionID is needed to trigger batching once the report action has been positioned
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reportActionID, combinedReportActions, indexOfLinkedAction, isLoading, currentReportActionID]);

    const reportActionIDMap = useMemo(() => {
        const reportActionIDs = allReportActions.map((action) => action.reportActionID);
        return reportActions.map((action) => ({
            reportActionID: action.reportActionID,
            reportID: reportActionIDs.includes(action.reportActionID) ? reportID : transactionThreadReport?.reportID,
        }));
    }, [allReportActions, reportID, transactionThreadReport, reportActions]);

    /**
     * Retrieves the next set of report actions for the chat once we are nearing the end of what we are currently
     * displaying.
     */
    const fetchNewerAction = useCallback(
        (newestReportAction: OnyxTypes.ReportAction) => {
            if (isLoadingNewerReportActions || isLoadingInitialReportActions) {
                return;
            }

            // If this is a one transaction report, ensure we load newer actions for both this report and the report associated with the transaction
            if (!lodashIsEmpty(transactionThreadReport)) {
                // Get newer actions based on the newest reportAction for the current report
                const newestActionCurrentReport = reportActionIDMap.find((item) => item.reportID === reportID);
                Report.getNewerActions(newestActionCurrentReport?.reportID ?? '0', newestActionCurrentReport?.reportActionID ?? '0');

                // Get newer actions based on the newest reportAction for the transaction thread report
                const newestActionTransactionThreadReport = reportActionIDMap.find((item) => item.reportID === transactionThreadReport.reportID);
                Report.getNewerActions(newestActionTransactionThreadReport?.reportID ?? '0', newestActionTransactionThreadReport?.reportActionID ?? '0');
            } else {
                Report.getNewerActions(reportID, newestReportAction.reportActionID);
            }
        },
        [isLoadingNewerReportActions, isLoadingInitialReportActions, reportID, transactionThreadReport, reportActionIDMap],
    );

    const hasMoreCached = reportActions.length < combinedReportActions.length;
    const newestReportAction = useMemo(() => reportActions?.[0], [reportActions]);
    const handleReportActionPagination = useCallback(
        ({firstReportActionID}: {firstReportActionID: string}) => {
            // This function is a placeholder as the actual pagination is handled by visibleReportActions
            if (!hasMoreCached) {
                isFirstLinkedActionRender.current = false;
                fetchNewerAction(newestReportAction);
            }
            if (isFirstLinkedActionRender.current) {
                isFirstLinkedActionRender.current = false;
            }
            setCurrentReportActionID(firstReportActionID);
        },
        [fetchNewerAction, hasMoreCached, newestReportAction],
    );

    const mostRecentIOUReportActionID = useMemo(() => ReportActionsUtils.getMostRecentIOURequestActionID(reportActions), [reportActions]);
    const hasCachedActionOnFirstRender = useInitialValue(() => reportActions.length > 0);
    const hasNewestReportAction = reportActions[0]?.created === report.lastVisibleActionCreated || reportActions[0]?.created === transactionThreadReport?.lastVisibleActionCreated;
    const oldestReportAction = useMemo(() => reportActions?.at(-1), [reportActions]);
    const hasCreatedAction = oldestReportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.CREATED;

    useEffect(() => {
        if (reportActionID) {
            return;
        }

        const interactionTask = InteractionManager.runAfterInteractions(() => {
            openReportIfNecessary();
        });
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        if (interactionTask) {
            return () => {
                interactionTask.cancel();
            };
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!reportActionID) {
            return;
        }

        // This function is triggered when a user clicks on a link to navigate to a report.
        // For each link click, we retrieve the report data again, even though it may already be cached.
        // There should be only one openReport execution per page start or navigating
        Report.openReport(reportID, reportActionID);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [route]);

    useEffect(() => {
        const prevNetwork = prevNetworkRef.current;
        // When returning from offline to online state we want to trigger a request to OpenReport which
        // will fetch the reportActions data and mark the report as read. If the report is not fully visible
        // then we call ReconnectToReport which only loads the reportActions data without marking the report as read.
        const wasNetworkChangeDetected = prevNetwork.isOffline && !network.isOffline;
        if (wasNetworkChangeDetected) {
            if (isReportFullyVisible) {
                openReportIfNecessary();
            } else {
                reconnectReportIfNecessary();
            }
        }
        // update ref with current network state
        prevNetworkRef.current = network;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [network, isReportFullyVisible]);

    useEffect(() => {
        const wasLoginChangedDetected = prevAuthTokenType === CONST.AUTH_TOKEN_TYPES.ANONYMOUS && !session?.authTokenType;
        if (wasLoginChangedDetected && didUserLogInDuringSession() && isUserCreatedPolicyRoom(report)) {
            if (isReportFullyVisible) {
                openReportIfNecessary();
            } else {
                reconnectReportIfNecessary();
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session, report, isReportFullyVisible]);

    useEffect(() => {
        const prevIsSmallScreenWidth = prevIsSmallScreenWidthRef.current;
        // If the view is expanded from mobile to desktop layout
        // we update the new marker position, mark the report as read, and fetch new report actions
        const didScreenSizeIncrease = prevIsSmallScreenWidth && !isSmallScreenWidth;
        const didReportBecomeVisible = isReportFullyVisible && didScreenSizeIncrease;
        if (didReportBecomeVisible) {
            openReportIfNecessary();
        }
        // update ref with current state
        prevIsSmallScreenWidthRef.current = isSmallScreenWidth;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSmallScreenWidth, reportActions, isReportFullyVisible]);

    useEffect(() => {
        // Ensures subscription event succeeds when the report/workspace room is created optimistically.
        // Check if the optimistic `OpenReport` or `AddWorkspaceRoom` has succeeded by confirming
        // any `pendingFields.createChat` or `pendingFields.addWorkspaceRoom` fields are set to null.
        // Existing reports created will have empty fields for `pendingFields`.
        const didCreateReportSuccessfully = !report.pendingFields || (!report.pendingFields.addWorkspaceRoom && !report.pendingFields.createChat);
        if (!didSubscribeToReportTypingEvents.current && didCreateReportSuccessfully) {
            const interactionTask = InteractionManager.runAfterInteractions(() => {
                Report.subscribeToReportTypingEvents(reportID);
                didSubscribeToReportTypingEvents.current = true;
            });
            return () => {
                interactionTask.cancel();
            };
        }
    }, [report.pendingFields, didSubscribeToReportTypingEvents, reportID]);

    const onContentSizeChange = useCallback((w: number, h: number) => {
        contentListHeight.current = h;
    }, []);

    const checkIfContentSmallerThanList = useCallback(() => windowHeight - DIFF_BETWEEN_SCREEN_HEIGHT_AND_LIST - SPACER > contentListHeight.current, [windowHeight]);

    /**
     * Retrieves the next set of report actions for the chat once we are nearing the end of what we are currently
     * displaying.
     */
    const loadOlderChats = useCallback(() => {
        // Only fetch more if we are neither already fetching (so that we don't initiate duplicate requests) nor offline.
        if (!!network.isOffline || isLoadingOlderReportActions || isLoadingInitialReportActions) {
            return;
        }

        // Don't load more chats if we're already at the beginning of the chat history
        if (!oldestReportAction || hasCreatedAction) {
            return;
        }

        if (!lodashIsEmpty(transactionThreadReport)) {
            // Get newer actions based on the newest reportAction for the current report
            const oldestActionCurrentReport = reportActionIDMap.findLast((item) => item.reportID === reportID);
            Report.getNewerActions(oldestActionCurrentReport?.reportID ?? '0', oldestActionCurrentReport?.reportActionID ?? '0');

            // Get newer actions based on the newest reportAction for the transaction thread report
            const oldestActionTransactionThreadReport = reportActionIDMap.findLast((item) => item.reportID === transactionThreadReport.reportID);
            Report.getNewerActions(oldestActionTransactionThreadReport?.reportID ?? '0', oldestActionTransactionThreadReport?.reportActionID ?? '0');
        } else {
            // Retrieve the next REPORT.ACTIONS.LIMIT sized page of comments
            Report.getOlderActions(reportID, oldestReportAction.reportActionID);
        }
    }, [network.isOffline, isLoadingOlderReportActions, isLoadingInitialReportActions, oldestReportAction, hasCreatedAction, reportID, reportActionIDMap, transactionThreadReport]);

    const loadNewerChats = useCallback(() => {
        if (isLoadingInitialReportActions || isLoadingOlderReportActions || network.isOffline || newestReportAction.pendingAction === CONST.RED_BRICK_ROAD_PENDING_ACTION.DELETE) {
            return;
        }
        // Determines if loading older reports is necessary when the content is smaller than the list
        // and there are fewer than 23 items, indicating we've reached the oldest message.
        const isLoadingOlderReportsFirstNeeded = checkIfContentSmallerThanList() && reportActions.length > 23;

        if (
            (reportActionID && indexOfLinkedAction > -1 && !hasNewestReportAction && !isLoadingOlderReportsFirstNeeded) ||
            (!reportActionID && !hasNewestReportAction && !isLoadingOlderReportsFirstNeeded)
        ) {
            handleReportActionPagination({firstReportActionID: newestReportAction?.reportActionID});
        }
    }, [
        isLoadingInitialReportActions,
        isLoadingOlderReportActions,
        checkIfContentSmallerThanList,
        reportActionID,
        indexOfLinkedAction,
        hasNewestReportAction,
        handleReportActionPagination,
        network.isOffline,
        reportActions.length,
        newestReportAction,
    ]);

    /**
     * Runs when the FlatList finishes laying out
     */
    const recordTimeToMeasureItemLayout = useCallback(() => {
        if (didLayout.current) {
            return;
        }

        didLayout.current = true;
        Timing.end(CONST.TIMING.SWITCH_REPORT, hasCachedActionOnFirstRender ? CONST.TIMING.WARM : CONST.TIMING.COLD);

        // Capture the init measurement only once not per each chat switch as the value gets overwritten
        if (!ReportActionsView.initMeasured) {
            Performance.markEnd(CONST.TIMING.REPORT_INITIAL_RENDER);
            ReportActionsView.initMeasured = true;
        } else {
            Performance.markEnd(CONST.TIMING.SWITCH_REPORT);
        }
    }, [hasCachedActionOnFirstRender]);

    useEffect(() => {
        // Temporary solution for handling REPORTPREVIEW. More details: https://expensify.slack.com/archives/C035J5C9FAP/p1705417778466539?thread_ts=1705035404.136629&cid=C035J5C9FAP
        // This code should be removed once REPORTPREVIEW is no longer repositioned.
        // We need to call openReport for gaps created by moving REPORTPREVIEW, which causes mismatches in previousReportActionID and reportActionID of adjacent reportActions. The server returns the correct sequence, allowing us to overwrite incorrect data with the correct one.
        const shouldOpenReport =
            newestReportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.REPORTPREVIEW &&
            !hasCreatedAction &&
            isReadyForCommentLinking &&
            reportActions.length < 24 &&
            reportActions.length >= 1 &&
            !isLoadingInitialReportActions &&
            !isLoadingOlderReportActions &&
            !isLoadingNewerReportActions;

        if (shouldOpenReport) {
            Report.openReport(reportID, reportActionID);
        }
    }, [
        hasCreatedAction,
        reportID,
        reportActions,
        reportActionID,
        newestReportAction?.actionName,
        isReadyForCommentLinking,
        isLoadingOlderReportActions,
        isLoadingNewerReportActions,
        isLoadingInitialReportActions,
    ]);

    // Check if the first report action in the list is the one we're currently linked to
    const isTheFirstReportActionIsLinked = newestReportAction?.reportActionID === reportActionID;

    useEffect(() => {
        let timerID: NodeJS.Timeout;

        if (isTheFirstReportActionIsLinked) {
            setNavigatingToLinkedMessage(true);
        } else {
            // After navigating to the linked reportAction, apply this to correctly set
            // `autoscrollToTopThreshold` prop when linking to a specific reportAction.
            InteractionManager.runAfterInteractions(() => {
                // Using a short delay to ensure the view is updated after interactions
                timerID = setTimeout(() => setNavigatingToLinkedMessage(false), 10);
            });
        }

        return () => {
            if (!timerID) {
                return;
            }
            clearTimeout(timerID);
        };
    }, [isTheFirstReportActionIsLinked]);

    // Comments have not loaded at all yet do nothing
    if (!reportActions.length) {
        return null;
    }
    // AutoScroll is disabled when we do linking to a specific reportAction
    const shouldEnableAutoScroll = hasNewestReportAction && (!reportActionID || !isNavigatingToLinkedMessage);

    return (
        <>
            <ReportActionsList
                report={report}
                transactionThreadReport={transactionThreadReport}
                reportActions={reportActions}
                parentReportAction={parentReportAction}
                onLayout={recordTimeToMeasureItemLayout}
                sortedReportActions={reportActions}
                mostRecentIOUReportActionID={mostRecentIOUReportActionID}
                loadOlderChats={loadOlderChats}
                loadNewerChats={loadNewerChats}
                isLoadingInitialReportActions={isLoadingInitialReportActions}
                isLoadingOlderReportActions={isLoadingOlderReportActions}
                isLoadingNewerReportActions={isLoadingNewerReportActions}
                listID={listID}
                onContentSizeChange={onContentSizeChange}
                shouldEnableAutoScrollToTopThreshold={shouldEnableAutoScroll}
            />
            <PopoverReactionList ref={reactionListRef} />
        </>
    );
}

ReportActionsView.displayName = 'ReportActionsView';
ReportActionsView.initMeasured = false;

function arePropsEqual(oldProps: ReportActionsViewProps, newProps: ReportActionsViewProps): boolean {
    if (!lodashIsEqual(oldProps.isReadyForCommentLinking, newProps.isReadyForCommentLinking)) {
        return false;
    }
    if (!lodashIsEqual(oldProps.reportActions, newProps.reportActions)) {
        return false;
    }

    if (!lodashIsEqual(oldProps.transactionThreadReportActions, newProps.transactionThreadReportActions)) {
        return false;
    }

    if (!lodashIsEqual(oldProps.parentReportAction, newProps.parentReportAction)) {
        return false;
    }

    if (oldProps.session?.authTokenType !== newProps.session?.authTokenType) {
        return false;
    }

    if (oldProps.isLoadingInitialReportActions !== newProps.isLoadingInitialReportActions) {
        return false;
    }

    if (oldProps.isLoadingOlderReportActions !== newProps.isLoadingOlderReportActions) {
        return false;
    }

    if (oldProps.isLoadingNewerReportActions !== newProps.isLoadingNewerReportActions) {
        return false;
    }

    return lodashIsEqual(oldProps.report, newProps.report);
}

const MemoizedReportActionsView = React.memo(ReportActionsView, arePropsEqual);

export default Performance.withRenderTrace({id: '<ReportActionsView> rendering'})(
    withOnyx<ReportActionsViewProps, ReportActionsViewOnyxProps>({
        session: {
            key: ONYXKEYS.SESSION,
        },
        transactionThreadReportActions: {
            key: ({reportActions}) => {
                const transactionThreadReportID = ReportActionsUtils.getOneTransactionThreadReportID(reportActions ?? []);
                return `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThreadReportID}`;
            },
            canEvict: false,
            selector: (reportActions: OnyxEntry<OnyxTypes.ReportActions>) => ReportActionsUtils.getSortedReportActionsForDisplay(reportActions, true),
        },
        transactionThreadReport: {
            key: ({reportActions}) => {
                const transactionThreadReportID = ReportActionsUtils.getOneTransactionThreadReportID(reportActions ?? []);
                return `${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReportID}`;
            },
        },
    })(MemoizedReportActionsView),
);
