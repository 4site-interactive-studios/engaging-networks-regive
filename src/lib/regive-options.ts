/**
 * Configuration options for the Regive component
 */
export interface RegiveOptions {
  /** Comma-separated amounts, each one will be a submit button */
  amount?: string;

  /** Message to convince people to regive */
  heading?: string;

  /** Message to show after the form is submitted */
  thankYouMessage?: string;

  /** Additional parameters to pass to the iFrame */
  params?: string;

  /** Set to false to disable confetti, or provide comma-separated hex color list */
  confetti?: string | boolean;

  /** Background color */
  bgColor?: string;

  /** Text color */
  txtColor?: string;

  /** Button background color */
  buttonBgColor?: string;

  /** Button text color */
  buttonTxtColor?: string;

  /** Button Label (It can have a merge tag {{amount}}) */
  buttonLabel?: string;

  /** Layout theme - If not part of the predefined themes, it will be used as a custom theme */
  theme?: string;

  /** Source of the donation (saved in supporter.appealCode). Set to "original" to reuse the appeal code from the original gift */
  source?: string;

  /** Base page ID to process the donation through */
  basePage?: string;

  /** Enable digital wallet payment methods */
  digitalWallets?: boolean;

  /** Enable test mode without actual form submission */
  test?: boolean;

  /** Specify a payment method for testing purposes (e.g., "card", "stripedigitalwallets") */
  testMethod?: string;

  /** Comma-separated list of mandatory field names to ignore when empty */
  ignoreRequiredFields?: string;

  /** Donation frequency for the regive donation: "onetime" (default), "monthly", "quarterly", or "annual". Recurring day defaults to the current day. */
  frequency?: string;

  /** Comma-separated list of original gift frequencies for which regive should not be shown (e.g. "annual,monthly") */
  hideForFrequency?: string;
}
