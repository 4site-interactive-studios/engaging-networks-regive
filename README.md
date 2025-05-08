# Engaging Networks Regive

Standalone Engaging Networks component that enables a customizable One-Click Instant Donation experience on your "Thank You" pages.
Designed to integrate seamlessly with the Engaging Networks donation form, this component can be added to any donation or premium page. It allows donors to repeat their gift with a single click—no need to refill the entire form.

No third-party libraries are required, and the component is fully customizable to match your branding and design preferences.

## Table of Contents

- [Engaging Networks Regive](#engaging-networks-regive)
  - [Table of Contents](#table-of-contents)
  - [Installation](#installation)
  - [Basic Usage](#basic-usage)
  - [Configuration Options](#configuration-options)
    - [Amount Options](#amount-options)
    - [Text Customization](#text-customization)
    - [Visual Styling](#visual-styling)
    - [Theme Options](#theme-options)
    - [Advanced Options](#advanced-options)
  - [Custom Theming](#custom-theming)
    - [Available Merge Tags](#available-merge-tags)
  - [Test Mode](#test-mode)
  - [Debug Mode](#debug-mode)
  - [Confetti Customization](#confetti-customization)
  - [Examples](#examples)
  - [Development](#development)

## Installation

1. Install dependencies and build the Regive component:

   ```bash
   npm install
   npm run build:prod
   ```

2. Upload the generated `dist/regive.min.js` file to your Engaging Networks account.

3. Add the script to your page templates in Engaging Networks:
   ```html
   <script src="/path/to/regive.min.js"></script>
   ```

## Basic Usage

Add the `<regive>` tag to your "Thank You" page in Engaging Networks. The component will only work on Donation/Premium Gift pages. Here's a basic example:

```html
<regive
  amount="5,8,10"
  heading="Make another impact today!"
  thank-you-message="Thank you for your additional gift!"
></regive>
```

## Configuration Options

The Regive component can be customized using various attributes on the `<regive>` tag.

### Amount Options

| Option         | Description                                                             | Example                                | Default            |
| -------------- | ----------------------------------------------------------------------- | -------------------------------------- | ------------------ |
| `amount`       | Comma-separated list of donation amounts to display as buttons          | `amount="5,8,10"`                      | `"5"`              |
| `button-label` | Label for the donation buttons (can include the `{{amount}}` merge tag) | `button-label="Donate {{amount}} Now"` | `"Add {{amount}}"` |

### Text Customization

| Option              | Description                                                  | Example                                                      | Default        |
| ------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ | -------------- |
| `heading`           | Message displayed above the donation buttons                 | `heading="Double your impact today!"`                        | `null`         |
| `thank-you-message` | Message shown after successful donation                      | `thank-you-message="Thank you for your additional support!"` | `"Thank You!"` |
| `source`            | Source code for the donation (saved in supporter.appealCode) | `source="REGIVE-CHRISTMAS"`                                  | `"REGIVE"`     |

### Visual Styling

| Option             | Description                              | Example                      | Default     |
| ------------------ | ---------------------------------------- | ---------------------------- | ----------- |
| `bg-color`         | Background color of the regive component | `bg-color="#f5f5f5"`         | `"#FFF"`    |
| `txt-color`        | Text color of the regive component       | `txt-color="#0d1117"`        | `"#333"`    |
| `button-bg-color`  | Background color of the buttons          | `button-bg-color="#0077cc"`  | `"#007BFF"` |
| `button-txt-color` | Text color of the buttons                | `button-txt-color="#FEFEFE"` | `"#FFF"`    |

### Theme Options

| Option  | Description                           | Example                | Default     |
| ------- | ------------------------------------- | ---------------------- | ----------- |
| `theme` | Layout theme for the regive component | `theme="button-right"` | `"stacked"` |

Available themes:

- `stacked`: Buttons stacked vertically
- `button-right`: Heading on left, buttons on right
- `button-left`: Buttons on left, heading on right
- `button-top`: Heading on top, buttons below

### Advanced Options

| Option     | Description                                     | Example                                                               | Default     |
| ---------- | ----------------------------------------------- | --------------------------------------------------------------------- | ----------- |
| `confetti` | Enable/disable confetti or set custom colors    | `confetti="#FF0000,#00FF00,#0000FF"`                                  | `"default"` |
| `test`     | Enable test mode without actual form submission | `test="true"`                                                         | `false`     |
| `params`   | Additional URL parameters to pass to the iFrame | `params="utm_source=thank_you&utm_medium=regive&utm_campaign=spring"` | `null`      |

## Custom Theming

You can create custom themes by:

1. Creating a template element with an ID that will be used as the theme name. **Important:** This template must be added to **Page 1 of your Engaging Networks Donation Page**, as it will be used when the donor starts the regive donation process.

   ```html
   <template id="my-custom-theme">
     <style>
       .my-custom-theme {
         background-color: {{bg-color}};
         color: {{txt-color}};
         padding: 20px;
         border-radius: 8px;
       }
       .my-custom-buttons {
         display: flex;
         justify-content: space-between;
       }
       .my-custom-buttons button {
         background-color: {{button-bg-color}};
         color: {{button-txt-color}};
         border: none;
         padding: 10px 20px;
         border-radius: 5px;
         cursor: pointer;
       }
     </style>
     <div class="my-custom-theme">
       {{heading}}
       <div class="my-custom-buttons">{{button}}</div>
     </div>
   </template>
   ```

2. Use the theme ID in your regive tag on the Thank You page:
   ```html
   <regive amount="8" theme="my-custom-theme"></regive>
   ```

### Available Merge Tags

The following merge tags can be used in custom templates:

| Merge Tag              | Description                  |
| ---------------------- | ---------------------------- |
| `{{heading}}`          | Inserts the heading content  |
| `{{button}}`           | Inserts the donation buttons |
| `{{theme}}`            | The current theme name       |
| `{{bg-color}}`         | The background color         |
| `{{txt-color}}`        | The text color               |
| `{{button-bg-color}}`  | The button background color  |
| `{{button-txt-color}}` | The button text color        |

Additionally, the `{{amount}}` merge tag can be used in the `button-label` attribute to include the donation amount in the button text.

## Test Mode

When you add Regive to your page, you can only see the Regive Component on your Thank You page if you have already submitted a **credit card donation**. That means that, if you access the Thank You page without having submitted a donation, you will not see the Regive Component.
To test the Regive component without submitting a donation, you can enable test mode. This allows you to see the component and test all its features without making an actual donation. This is especially useful for testing the visual appearance and functionality of the component before going live.
To enable test mode, add the `test` attribute to the `<regive>` tag:

```html
<regive amount="5" test="true"></regive>
```

This will enable test mode for the Regive component.

When test mode is enabled:

- The component will display "Test Mode" on the right side
- Clicking a donation button will simulate the donation process
- The thank you message will appear after a simulated delay
- No actual donation will be processed
- The submission will reset after 8 seconds

**Test mode is useful for:**

- Verifying your configuration
- Testing the visual appearance
- Ensuring the thank you message displays correctly
- Satisfying your craving for confetti 🎉

## Debug Mode

To enable debug mode, add `debug` to the script source:

```html
<script src="/path/to/regive.min.js?debug"></script>
```

Debug mode will:

- Show detailed console logs
- Display information about component initialization
- Show events and state changes
- Help troubleshoot integration issues

## Confetti Customization

The confetti animation can be customized or disabled entirely:

```html
<!-- Custom confetti colors -->
<regive confetti="#FF0000,#00FF00,#0000FF"></regive>

<!-- Disable confetti -->
<regive confetti="false"></regive>
```

The default confetti uses a bunch of colors that Fernando thinks are nice for your carnival.

## Examples

Here's a complete example with various configuration options:

```html
<!-- Basic example with custom styling and analytics parameters -->
<regive
  amount="6"
  heading="Make twice the impact!"
  thank-you-message="Thank you for your additional support!"
  button-label="Donate {{amount}} more"
  bg-color="#f8f9fa"
  txt-color="#212529"
  button-bg-color="#28a745"
  button-txt-color="#ffffff"
  theme="button-right"
  confetti="#28a745,#20c997,#6c757d"
  source="SPRING_REGIVE"
  params="utm_source=thank_you&utm_medium=regive&utm_campaign=spring2025"
>
</regive>
```

Here's a more complex example with custom theming and test mode:

```html
<!-- Test mode example with custom theme -> THIS SHOULD GO ON PAGE 1 -->
<template id="kitten-theme">
  <style>
     .kitten-regive {
        background-color: {{bg-color}};
        color: {{txt-color}};
        padding: 20px;
        border-radius: 8px;
     }
     .kitten-regive img {
        max-width: 100%;
        max-height: 300px;
        border-radius: 8px;
        height: auto;
        object-fit: cover;
     }
     .kitten-regive button {
        background-color: {{button-bg-color}};
        color: {{button-txt-color}};
        border: none;
        padding: 10px 20px;
        border-radius: 5px;
        cursor: pointer;
     }
     .kitten-regive-disclaimer {
        margin-top: 15px;
     }
    .kitten-regive-disclaimer p {
       text-align: center;
       font-size: 0.8rem;
    }
  </style>
  <div class="kitten-regive">
    <div class="kitten-regive-img">
      <img src="https://placecats.com/550/300?fit=cover" alt="Adopt a kitten" />
    </div>
    {{heading}}
    <p>
      You’ve already made a meaningful impact—thank you! With a small additional
      gift today, you can symbolically adopt a kitten and help us provide
      shelter, food, and care for these adorable animals.
    </p>
    {{button}}
    <div class="kitten-regive-disclaimer">
      <p>
        By clicking the button above, you’ll quickly process a new donation to
        your card!
      </p>
    </div>
  </div>
</template>

<!-- THIS SHOULD GO ON THE THANK YOU PAGE -->
<regive
  amount="8"
  button-label="give {{amount}} more"
  heading="Adopt a kitten today!"
  thank-you-message="You have a new furry friend! 🐱"
  theme="kitten-theme"
  test="true"
>
</regive>
```

## Development

1. Clone the repository
2. Install dependencies
   ```bash
   npm install
   ```
3. Start the development server
   ```bash
   npm run dev
   ```
4. Open your browser and navigate to `http://localhost:3000`
5. Open the console to see debug messages
6. Build for production
   ```bash
   npm run build:prod
   ```
7. The minified file will be available at `dist/regive.min.js`
