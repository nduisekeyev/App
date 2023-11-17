import Str from 'expensify-common/lib/str';
import React, {Component, ForwardedRef, forwardRef, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
    ActivityIndicator,
    Animated,
    FlexStyle,
    GestureResponderEvent,
    LayoutChangeEvent,
    NativeSyntheticEvent,
    StyleProp,
    StyleSheet,
    TextInput,
    TextInputFocusEventData,
    TextInputProps,
    View,
    ViewStyle,
} from 'react-native';
import {AnimatedProps} from 'react-native-reanimated';
import Checkbox from '@components/Checkbox';
import FormHelpMessage from '@components/FormHelpMessage';
import Icon from '@components/Icon';
import * as Expensicons from '@components/Icon/Expensicons';
import PressableWithoutFeedback from '@components/Pressable/PressableWithoutFeedback';
import RNTextInput from '@components/RNTextInput';
import SwipeInterceptPanResponder from '@components/SwipeInterceptPanResponder';
import Text from '@components/Text';
import * as styleConst from '@components/TextInput/styleConst';
import TextInputLabel from '@components/TextInput/TextInputLabel';
import withLocalize from '@components/withLocalize';
import * as Browser from '@libs/Browser';
import isInputAutoFilled from '@libs/isInputAutoFilled';
import useNativeDriver from '@libs/useNativeDriver';
import styles from '@styles/styles';
import * as StyleUtils from '@styles/StyleUtils';
import themeColors from '@styles/themes/default';
import variables from '@styles/variables';
import CONST from '@src/CONST';
import BaseTextInputProps from './types';

function BaseTextInput(
    {
        label = '',
        // name = '',
        value = undefined,
        defaultValue = undefined,
        placeholder = '',
        errorText = '',
        icon = null,
        textInputContainerStyles = [],
        containerStyles = [],
        inputStyle = [],
        forceActiveLabel = false,
        autoFocus = false,
        disableKeyboard = false,
        autoGrow = false,
        autoGrowHeight = false,
        hideFocusedState = false,
        maxLength = undefined,
        hint = '',
        // shouldSaveDraft = false,
        onInputChange = () => {},
        shouldDelayFocus = false,
        submitOnEnter = false,
        multiline = false,
        // shouldUseDefaultValue = false,
        shouldInterceptSwipe = false,
        autoCorrect = true,
        prefixCharacter,
        inputID,
        ...inputProps
    }: BaseTextInputProps,
    ref: ForwardedRef<HTMLFormElement | Component<AnimatedProps<TextInputProps>, unknown, unknown>>,
) {
    const {hasError = false} = inputProps;
    const initialValue = value ?? defaultValue ?? '';
    const initialActiveLabel = !!forceActiveLabel || initialValue.length > 0 || Boolean(prefixCharacter);

    const [isFocused, setIsFocused] = useState(false);
    const [passwordHidden, setPasswordHidden] = useState(inputProps.secureTextEntry);
    const [textInputWidth, setTextInputWidth] = useState(0);
    const [textInputHeight, setTextInputHeight] = useState(0);
    const [height, setHeight] = useState<number>(variables.componentSizeLarge);
    const [width, setWidth] = useState<number>();
    const labelScale = useRef(new Animated.Value(initialActiveLabel ? styleConst.ACTIVE_LABEL_SCALE : styleConst.INACTIVE_LABEL_SCALE)).current;
    const labelTranslateY = useRef(new Animated.Value(initialActiveLabel ? styleConst.ACTIVE_LABEL_TRANSLATE_Y : styleConst.INACTIVE_LABEL_TRANSLATE_Y)).current;

    const input = useRef<TextInput>(null);
    const isLabelActive = useRef(initialActiveLabel);

    // AutoFocus which only works on mount:
    useEffect(() => {
        // We are manually managing focus to prevent this issue: https://github.com/Expensify/App/issues/4514
        if (!autoFocus || !input.current) {
            return;
        }

        if (shouldDelayFocus) {
            const focusTimeout = setTimeout(() => input?.current?.focus(), CONST.ANIMATED_TRANSITION);
            return () => clearTimeout(focusTimeout);
        }
        input.current.focus();
        // We only want this to run on mount
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const animateLabel = useCallback(
        (translateY: number, scale: number) => {
            Animated.parallel([
                Animated.spring(labelTranslateY, {
                    toValue: translateY,
                    // duration: styleConst.LABEL_ANIMATION_DURATION,
                    useNativeDriver,
                }),
                Animated.spring(labelScale, {
                    toValue: scale,
                    // duration: styleConst.LABEL_ANIMATION_DURATION,
                    useNativeDriver,
                }),
            ]).start();
        },
        [labelScale, labelTranslateY],
    );

    const activateLabel = useCallback(() => {
        const newValue = value ?? '';

        if (newValue.length < 0 || isLabelActive.current) {
            return;
        }

        animateLabel(styleConst.ACTIVE_LABEL_TRANSLATE_Y, styleConst.ACTIVE_LABEL_SCALE);
        isLabelActive.current = true;
    }, [animateLabel, value]);

    const deactivateLabel = useCallback(() => {
        const newValue = value ?? '';

        if (!!forceActiveLabel || newValue.length !== 0 || prefixCharacter) {
            return;
        }

        animateLabel(styleConst.INACTIVE_LABEL_TRANSLATE_Y, styleConst.INACTIVE_LABEL_SCALE);
        isLabelActive.current = false;
    }, [animateLabel, forceActiveLabel, prefixCharacter, value]);

    const onFocus = (event: NativeSyntheticEvent<TextInputFocusEventData>) => {
        if (inputProps.onFocus) {
            onFocus(event);
        }
        setIsFocused(true);
    };

    const onBlur = (event: NativeSyntheticEvent<TextInputFocusEventData>) => {
        if (inputProps.onBlur) {
            inputProps.onBlur(event);
        }
        setIsFocused(false);
    };

    const onPress = (event?: GestureResponderEvent | KeyboardEvent) => {
        if (!!inputProps.disabled || !event) {
            return;
        }

        if (inputProps.onPress) {
            inputProps.onPress(event);
        }

        if ('isDefaultPrevented' in event && !event?.isDefaultPrevented()) {
            input.current?.focus();
        }
    };

    const onLayout = useCallback(
        (event: LayoutChangeEvent) => {
            if (!autoGrowHeight && multiline) {
                return;
            }

            const layout = event.nativeEvent.layout;

            setWidth((prevWidth: number | undefined) => (autoGrowHeight ? layout.width : prevWidth));
            setHeight((prevHeight: number) => (!multiline ? layout.height : prevHeight));
        },
        [autoGrowHeight, multiline],
    );

    // The ref is needed when the component is uncontrolled and we don't have a value prop
    const hasValueRef = useRef(initialValue.length > 0);
    const inputValue = value ?? '';
    const hasValue = inputValue.length > 0 || hasValueRef.current;

    // Activate or deactivate the label when either focus changes, or for controlled
    // components when the value prop changes:
    useEffect(() => {
        if (
            hasValue ||
            isFocused ||
            // If the text has been supplied by Chrome autofill, the value state is not synced with the value
            // as Chrome doesn't trigger a change event. When there is autofill text, keep the label activated.
            isInputAutoFilled(input.current as unknown as Element)
        ) {
            activateLabel();
        } else {
            deactivateLabel();
        }
    }, [activateLabel, deactivateLabel, hasValue, isFocused]);

    // When the value prop gets cleared externally, we need to keep the ref in sync:
    useEffect(() => {
        // Return early when component uncontrolled, or we still have a value
        if (value === undefined || value) {
            return;
        }
        hasValueRef.current = false;
    }, [value]);

    /**
     * Set Value & activateLabel
     */
    const setValue = (newValue: string) => {
        if (onInputChange) {
            onInputChange(newValue);
        }
        if (inputProps.onChangeText) {
            Str.result(inputProps.onChangeText, newValue);
        }
        if (newValue && newValue.length > 0) {
            hasValueRef.current = true;
            // When the componment is uncontrolled, we need to manually activate the label:
            if (value === undefined) {
                activateLabel();
            }
        } else {
            hasValueRef.current = false;
        }
    };

    const togglePasswordVisibility = useCallback(() => {
        setPasswordHidden((prevPasswordHidden: boolean | undefined) => !prevPasswordHidden);
    }, []);

    // When adding a new prefix character, adjust this method to add expected character width.
    // This is because character width isn't known before it's rendered to the screen, and once it's rendered,
    // it's too late to calculate it's width because the change in padding would cause a visible jump.
    // Some characters are wider than the others when rendered, e.g. '@' vs '#'. Chosen font-family and font-size
    // also have an impact on the width of the character, but as long as there's only one font-family and one font-size,
    // this method will produce reliable results.
    const getCharacterPadding = (prefix: string) => {
        switch (prefix) {
            case CONST.POLICY.ROOM_PREFIX:
                return 10;
            default:
                throw new Error(`Prefix ${prefix} has no padding assigned.`);
        }
    };

    const hasLabel = Boolean(label?.length);
    const isReadOnly = inputProps.readOnly ?? inputProps.disabled;
    const inputHelpText = errorText || hint;
    const newPlaceholder = !!prefixCharacter || isFocused || !hasLabel || (hasLabel && forceActiveLabel) ? placeholder : undefined;
    const maxHeight = StyleSheet.flatten(containerStyles).maxHeight;
    const newTextInputContainerStyles: StyleProp<ViewStyle & FlexStyle> = StyleSheet.flatten([
        styles.textInputContainer,
        textInputContainerStyles,
        autoGrow && StyleUtils.getWidthStyle(textInputWidth),
        !hideFocusedState && isFocused && styles.borderColorFocus,
        (!!hasError || !!errorText) && styles.borderColorDanger,
        autoGrowHeight && {scrollPaddingTop: typeof maxHeight === 'number' ? 2 * maxHeight : undefined},
    ]);
    const isMultiline = multiline ?? autoGrowHeight;

    /* To prevent text jumping caused by virtual DOM calculations on Safari and mobile Chrome,
    make sure to include the `lineHeight`.
    Reference: https://github.com/Expensify/App/issues/26735
 
    For other platforms, explicitly remove `lineHeight` from single-line inputs
    to prevent long text from disappearing once it exceeds the input space.
    See https://github.com/Expensify/App/issues/13802 */

    const lineHeight = useMemo(() => {
        if ((Browser.isSafari() || Browser.isMobileChrome()) && Array.isArray(inputStyle)) {
            const lineHeightValue = inputStyle?.find((f) => f && 'lineHeight' in f && f.lineHeight !== undefined);
            if (lineHeightValue && 'lineHeight' in lineHeightValue) {
                return lineHeightValue.lineHeight;
            }
        }

        return undefined;
    }, [inputStyle]);

    return (
        <>
            <View
                style={styles.pointerEventsNone}
                // eslint-disable-next-line react/jsx-props-no-spreading
                {...(shouldInterceptSwipe && SwipeInterceptPanResponder.panHandlers)}
            >
                <PressableWithoutFeedback
                    onPress={onPress}
                    tabIndex={-1}
                    accessibilityLabel={label ?? ''}
                    accessible
                    style={[
                        autoGrowHeight && styles.autoGrowHeightInputContainer(textInputHeight, variables.componentSizeLarge, typeof maxHeight === 'number' ? maxHeight : 0),
                        !isMultiline && styles.componentHeightLarge,
                        containerStyles,
                    ]}
                >
                    <View
                        // When autoGrowHeight is true we calculate the width for the textInput, so it will break lines properly
                        // or if multiline is not supplied we calculate the textinput height, using onLayout.
                        onLayout={onLayout}
                        style={[
                            newTextInputContainerStyles,

                            // When autoGrow is on and minWidth is not supplied, add a minWidth to allow the input to be focusable.
                            autoGrow && !newTextInputContainerStyles?.minWidth && styles.mnw2,
                        ]}
                    >
                        {hasLabel ? (
                            <>
                                {/* Adding this background to the label only for multiline text input,
                                to prevent text overlapping with label when scrolling */}
                                {isMultiline && <View style={[styles.textInputLabelBackground, styles.pointerEventsNone]} />}
                                <TextInputLabel
                                    isLabelActive={isLabelActive.current}
                                    label={label ?? ''}
                                    labelTranslateY={labelTranslateY}
                                    labelScale={labelScale}
                                    for={inputProps.nativeID}
                                />
                            </>
                        ) : null}
                        <View style={[styles.textInputAndIconContainer, isMultiline && hasLabel && styles.textInputMultilineContainer, styles.pointerEventsBoxNone]}>
                            {Boolean(prefixCharacter) && (
                                <View style={styles.textInputPrefixWrapper}>
                                    <Text
                                        tabIndex={-1}
                                        style={[styles.textInputPrefix, !hasLabel && styles.pv0, styles.pointerEventsNone]}
                                        dataSet={{[CONST.SELECTION_SCRAPER_HIDDEN_ELEMENT]: true}}
                                    >
                                        {prefixCharacter}
                                    </Text>
                                </View>
                            )}
                            <RNTextInput
                                ref={(el) => {
                                    if (typeof ref === 'function') {
                                        ref(el);
                                    } else if (ref && 'current' in ref) {
                                        // eslint-disable-next-line no-param-reassign
                                        ref.current = el;
                                    }
                                    // @ts-expect-error We need to reassign this ref to the input ref
                                    input.current = el;
                                }}
                                // eslint-disable-next-line
                                {...inputProps}
                                autoCorrect={inputProps.secureTextEntry ? false : autoCorrect}
                                placeholder={newPlaceholder}
                                placeholderTextColor={themeColors.placeholderText}
                                underlineColorAndroid="transparent"
                                style={[
                                    styles.flex1,
                                    styles.w100,
                                    inputStyle,
                                    (!hasLabel || isMultiline) && styles.pv0,
                                    !!prefixCharacter && StyleUtils.getPaddingLeft(getCharacterPadding(prefixCharacter) + styles.pl1.paddingLeft),
                                    inputProps.secureTextEntry && styles.secureInput,

                                    // Explicitly remove `lineHeight` from single line inputs so that long text doesn't disappear
                                    // once it exceeds the input space (See https://github.com/Expensify/App/issues/13802)
                                    !isMultiline && {height, lineHeight},

                                    // Explicitly change boxSizing attribute for mobile chrome in order to apply line-height
                                    // for the issue mentioned here https://github.com/Expensify/App/issues/26735
                                    !isMultiline && Browser.isMobileChrome() && {boxSizing: 'content-box', height: undefined},

                                    // Stop scrollbar flashing when breaking lines with autoGrowHeight enabled.
                                    autoGrowHeight && StyleUtils.getAutoGrowHeightInputStyle(textInputHeight, typeof maxHeight === 'number' ? maxHeight : 0),
                                    // Add disabled color theme when field is not editable.
                                    inputProps.disabled && styles.textInputDisabled,
                                    styles.pointerEventsAuto,
                                ]}
                                multiline={isMultiline}
                                maxLength={maxLength}
                                onFocus={onFocus}
                                onBlur={onBlur}
                                onChangeText={setValue}
                                secureTextEntry={passwordHidden}
                                onPressOut={inputProps.onPress}
                                showSoftInputOnFocus={!disableKeyboard}
                                inputMode={inputProps.inputMode}
                                value={value}
                                selection={inputProps.selection}
                                readOnly={isReadOnly}
                                defaultValue={defaultValue}
                                // FormSubmit Enter key handler does not have access to direct props.
                                // `dataset.submitOnEnter` is used to indicate that pressing Enter on this input should call the submit callback.
                                dataSet={{submitOnEnter: isMultiline && submitOnEnter}}
                            />
                            {inputProps.isLoading && (
                                <ActivityIndicator
                                    size="small"
                                    color={themeColors.iconSuccessFill}
                                    style={[styles.mt4, styles.ml1]}
                                />
                            )}
                            {Boolean(inputProps.secureTextEntry) && (
                                <Checkbox
                                    style={[styles.flex1, styles.textInputIconContainer]}
                                    onPress={togglePasswordVisibility}
                                    onMouseDown={(e) => e.preventDefault()}
                                    accessibilityLabel={inputProps.translate?.('common.visible') ?? ''}
                                >
                                    <Icon
                                        src={passwordHidden ? Expensicons.Eye : Expensicons.EyeDisabled}
                                        fill={themeColors.icon}
                                    />
                                </Checkbox>
                            )}
                            {!inputProps.secureTextEntry && icon && (
                                <View style={[styles.textInputIconContainer, !isReadOnly ? styles.cursorPointer : styles.pointerEventsNone]}>
                                    <Icon
                                        src={icon}
                                        fill={themeColors.icon}
                                    />
                                </View>
                            )}
                        </View>
                    </View>
                </PressableWithoutFeedback>
                {!!inputHelpText && (
                    <FormHelpMessage
                        isError={!errorText}
                        message={inputHelpText}
                    />
                )}
            </View>
            {/*
                 Text input component doesn't support auto grow by default.
                 We're using a hidden text input to achieve that.
                 This text view is used to calculate width or height of the input value given textStyle in this component.
                 This Text component is intentionally positioned out of the screen.
             */}
            {(!!autoGrow || autoGrowHeight) && (
                // Add +2 to width on Safari browsers so that text is not cut off due to the cursor or when changing the value
                // https://github.com/Expensify/App/issues/8158
                // https://github.com/Expensify/App/issues/26628
                <Text
                    style={[
                        inputStyle,
                        autoGrowHeight && styles.autoGrowHeightHiddenInput(width ?? 0, typeof maxHeight === 'number' ? maxHeight : undefined),
                        styles.hiddenElementOutsideOfWindow,
                        styles.visibilityHidden,
                    ]}
                    onLayout={(e) => {
                        let additionalWidth = 0;
                        if (Browser.isMobileSafari() || Browser.isSafari()) {
                            additionalWidth = 2;
                        }
                        setTextInputWidth(e.nativeEvent.layout.width + additionalWidth);
                        setTextInputHeight(e.nativeEvent.layout.height);
                    }}
                >
                    {/* \u200B added to solve the issue of not expanding the text input enough when the value ends with '\n' (https://github.com/Expensify/App/issues/21271) */}
                    {value ? `${value}${value.endsWith('\n') ? '\u200B' : ''}` : placeholder}
                </Text>
            )}
        </>
    );
}

BaseTextInput.displayName = 'BaseTextInput';

export default withLocalize(forwardRef(BaseTextInput));
