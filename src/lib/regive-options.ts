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

  /** Source of the donation */
  source?: string;

  /** Enable test mode without actual form submission */
  test?: boolean;
}
