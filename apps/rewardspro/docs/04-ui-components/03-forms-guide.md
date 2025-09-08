# Comprehensive Shopify Polaris React Form and Input Components Implementation Guide

This guide provides detailed technical documentation for implementing all major Shopify Polaris React form and input components, based on the official documentation. Each component includes proper imports, key props, complete implementation examples, and best practices.

## Table of Contents
1. [Autocomplete Component](#1-autocomplete-component)
2. [Checkbox Component](#2-checkbox-component)
3. [Choice List Component](#3-choice-list-component)
4. [Color Picker Component](#4-color-picker-component)
5. [Combobox Component](#5-combobox-component)
6. [Date Picker Component](#6-date-picker-component)
7. [Drop Zone Component](#7-drop-zone-component)
8. [Filters Component](#8-filters-component)
9. [Form Component](#9-form-component)
10. [Index Filters Component](#10-index-filters-component)
11. [Inline Error Component](#11-inline-error-component)
12. [Radio Button Component](#12-radio-button-component)
13. [Range Slider Component](#13-range-slider-component)
14. [Select Component](#14-select-component)
15. [Tag Component](#15-tag-component)
16. [Text Field Component](#16-text-field-component)

## Setup Requirements

### Installation
```bash
npm install @shopify/polaris @shopify/polaris-icons
```

### App Provider Setup
```javascript
import { AppProvider } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import '@shopify/polaris/build/esm/styles.css';

function App() {
  return (
    <AppProvider i18n={enTranslations}>
      {/* Your app content */}
    </AppProvider>
  );
}
```

---

## 1. Autocomplete Component

### Import Statement
```javascript
import { Autocomplete, Icon } from '@shopify/polaris';
import { SearchIcon } from '@shopify/polaris-icons';
import { useState, useCallback, useMemo } from 'react';
```

### Key Props
- **options** (required): `OptionDescriptor[] | SectionDescriptor[]` - Collection of options to be listed
- **selected** (required): `string[]` - The selected options
- **textField** (required): `React.ReactElement` - The text field component attached to the list
- **onSelect** (required): `(selected: string[]) => void` - Callback when selection changes
- **allowMultiple**: `boolean` - Allow multiple selections
- **loading**: `boolean` - Display loading state
- **emptyState**: `React.ReactNode` - Content when no options
- **actionBefore**: `ActionListItemDescriptor` - Action above list
- **willLoadMoreResults**: `boolean` - Indicates more results will load
- **onLoadMoreResults**: `() => void` - Callback when reaching list bottom

### Implementation Variations

#### 1.1 Default Autocomplete
```javascript
function DefaultAutocomplete() {
  const deselectedOptions = useMemo(
    () => [
      { value: 'rustic', label: 'Rustic' },
      { value: 'antique', label: 'Antique' },
      { value: 'vinyl', label: 'Vinyl' },
      { value: 'vintage', label: 'Vintage' },
      { value: 'refurbished', label: 'Refurbished' },
    ],
    [],
  );

  const [selectedOptions, setSelectedOptions] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [options, setOptions] = useState(deselectedOptions);

  const updateText = useCallback((value) => {
    setInputValue(value);
    if (value === '') {
      setOptions(deselectedOptions);
      return;
    }
    const filterRegex = new RegExp(value, 'i');
    const resultOptions = deselectedOptions.filter((option) =>
      option.label.match(filterRegex),
    );
    setOptions(resultOptions);
  }, [deselectedOptions]);

  const updateSelection = useCallback((selected) => {
    const selectedValue = selected.map((selectedItem) => {
      const matchedOption = options.find((option) =>
        option.value.match(selectedItem)
      );
      return matchedOption && matchedOption.label;
    });
    setSelectedOptions(selected);
    setInputValue(selectedValue[0] || '');
  }, [options]);

  const textField = (
    <Autocomplete.TextField
      onChange={updateText}
      label="Tags"
      value={inputValue}
      prefix={<Icon source={SearchIcon} tone="base" />}
      placeholder="Search"
      autoComplete="off"
    />
  );

  return (
    <div style={{ height: '225px' }}>
      <Autocomplete
        options={options}
        selected={selectedOptions}
        onSelect={updateSelection}
        textField={textField}
      />
    </div>
  );
}
```

#### 1.2 With Multiple Tags
```javascript
function MultipleTagsAutocomplete() {
  const [selectedOptions, setSelectedOptions] = useState([]);
  const [inputValue, setInputValue] = useState('');
  
  const updateSelection = useCallback((selected) => {
    setSelectedOptions(selected);
    setInputValue('');
  }, []);

  return (
    <Autocomplete
      allowMultiple
      options={options}
      selected={selectedOptions}
      onSelect={updateSelection}
      textField={textField}
    />
  );
}
```

#### 1.3 With Multiple Sections
```javascript
const sectionedOptions = [
  {
    title: 'Suggested',
    options: [
      { value: 'rustic', label: 'Rustic' },
      { value: 'antique', label: 'Antique' },
    ],
  },
  {
    title: 'Others',
    options: [
      { value: 'vinyl', label: 'Vinyl' },
      { value: 'vintage', label: 'Vintage' },
    ],
  },
];
```

#### 1.4 Loading State
```javascript
<Autocomplete
  options={options}
  selected={selectedOptions}
  onSelect={updateSelection}
  textField={textField}
  loading={loading}
/>
```

#### 1.5 Lazy Loading
```javascript
<Autocomplete
  options={options}
  selected={selectedOptions}
  onSelect={updateSelection}
  textField={textField}
  loading={loading}
  willLoadMoreResults={hasMore}
  onLoadMoreResults={loadMoreResults}
/>
```

#### 1.6 Empty State
```javascript
const emptyStateMarkup = (
  <div style={{ padding: '20px', textAlign: 'center' }}>
    <p>No results found</p>
    <p style={{ color: '#6b7280', fontSize: '14px' }}>
      Try adjusting your search terms
    </p>
  </div>
);

<Autocomplete
  options={options}
  selected={selectedOptions}
  onSelect={updateSelection}
  textField={textField}
  emptyState={emptyStateMarkup}
/>
```

#### 1.7-1.9 Action Variations
```javascript
// Regular Action
const actionBefore = {
  content: `Add "${inputValue}"`,
  onAction: handleActionClick,
  disabled: !inputValue,
};

// Wrapping Action
const actionBefore = {
  content: `Create new category: "${inputValue}"`,
  onAction: handleActionClick,
  wrapOverflow: true,
};

// Destructive Action
const actionBefore = {
  content: `Delete ${selectedOptions.length} items`,
  onAction: handleDestructiveAction,
  destructive: true,
};
```

### Common Use Cases
- Product tag selection
- Customer search with filtering
- Location autocomplete
- Category selection

### Best Practices
- Use `useMemo` and `useCallback` for performance
- Implement debouncing for API calls
- Provide clear empty states
- Consider container height for popover display

### Accessibility
- Follows ARIA 1.2 Combobox Pattern
- Full keyboard navigation (Tab, Arrow keys, Enter, Escape)
- Screen reader announcements
- Proper focus management

---

## 2. Checkbox Component

### Import Statement
```javascript
import { Checkbox } from '@shopify/polaris';
```

### Key Props
- **label** (required): `React.ReactNode` - Label for the checkbox
- **checked**: `boolean | "indeterminate"` - Selection state
- **onChange**: `(newChecked: boolean, id: string) => void` - Change handler
- **error**: `any` - Display error message
- **helpText**: `React.ReactNode` - Additional help text
- **disabled**: `boolean` - Disable checkbox
- **id**: `string` - ID for form input
- **name**: `string` - Name for form input
- **value**: `string` - Value for form input

### Complete Implementation
```javascript
function CheckboxExample() {
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [showError, setShowError] = useState(false);

  const handleChange = useCallback((newChecked) => {
    setAcceptTerms(newChecked);
    if (newChecked) setShowError(false);
  }, []);

  return (
    <Checkbox
      label="I agree to the Terms of Service"
      checked={acceptTerms}
      onChange={handleChange}
      error={showError ? "You must accept the terms" : undefined}
      helpText="Required to create your account"
      id="terms-checkbox"
      name="acceptTerms"
    />
  );
}
```

---

## 3. Choice List Component

### Import Statement
```javascript
import { ChoiceList } from '@shopify/polaris';
```

### Key Props
- **title** (required): `React.ReactNode` - Label for list of choices
- **choices** (required): `Choice[]` - Collection of choices
- **selected** (required): `string[]` - Selected choices
- **onChange**: `(selected: string[], name: string) => void` - Change handler
- **allowMultiple**: `boolean` - Allow multiple selections
- **error**: `any` - Display error message

### Implementation Variations

#### 3.1 Default Choice List
```javascript
function DefaultChoiceList() {
  const [selected, setSelected] = useState(['hidden']);
  
  return (
    <ChoiceList
      title="Company name visibility"
      choices={[
        { label: 'Hidden', value: 'hidden' },
        { label: 'Optional', value: 'optional' },
        { label: 'Required', value: 'required' },
      ]}
      selected={selected}
      onChange={setSelected}
    />
  );
}
```

#### 3.2 With Error
```javascript
<ChoiceList
  title="Shipping method"
  choices={shippingChoices}
  selected={selected}
  onChange={handleChange}
  error={error}
/>
```

#### 3.3 Multi-Choice
```javascript
<ChoiceList
  title="Select notification preferences"
  allowMultiple
  choices={[
    { 
      label: 'Email notifications', 
      value: 'email',
      helpText: 'Receive updates via email'
    },
    { 
      label: 'SMS notifications', 
      value: 'sms',
      helpText: 'Receive updates via text'
    },
  ]}
  selected={selected}
  onChange={handleChange}
/>
```

#### 3.4-3.5 Children Content
```javascript
const choices = [
  { 
    label: 'Percentage', 
    value: 'percentage',
    renderChildren: () => (
      selected.includes('percentage') && (
        <TextField
          label="Discount percentage"
          type="number"
          value={customValue}
          onChange={handleCustomValueChange}
          suffix="%"
        />
      )
    )
  }
];
```

---

## 4. Color Picker Component

### Import Statement
```javascript
import { ColorPicker } from '@shopify/polaris';
```

### Key Props
- **color** (required): `HSBAColor` - Current color value
- **onChange** (required): `(color: HSBAColor) => void` - Change handler
- **allowAlpha**: `boolean` - Enable alpha channel
- **fullWidth**: `boolean` - Full width hue picker

### Implementation Variations

#### 4.1 Default Color Picker
```javascript
function DefaultColorPicker() {
  const [color, setColor] = useState({
    hue: 120,
    brightness: 1,
    saturation: 1,
  });

  return (
    <ColorPicker
      onChange={setColor}
      color={color}
    />
  );
}
```

#### 4.2 With Transparent Value
```javascript
const [color, setColor] = useState({
  hue: 120,
  brightness: 1,
  saturation: 1,
  alpha: 0.7,
});

<ColorPicker
  onChange={setColor}
  color={color}
  allowAlpha
/>
```

#### 4.3 With Transparent Value Full Width
```javascript
<ColorPicker
  onChange={setColor}
  color={color}
  allowAlpha
  fullWidth
/>
```

### Color Conversion Utilities
```javascript
function hsbaToRgba(hsba) {
  const { hue, saturation, brightness, alpha = 1 } = hsba;
  // Conversion logic
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
```

---

## 5. Combobox Component

### Import Statement
```javascript
import { Combobox, Listbox, Icon } from '@shopify/polaris';
import { SearchIcon } from '@shopify/polaris-icons';
```

### Key Props
- **activator** (required): `React.ReactElement` - Text field to activate popover
- **allowMultiple**: `boolean` - Allow multiple selections
- **children**: `any` - Content inside popover
- **preferredPosition**: `'above' | 'below' | 'mostSpace' | 'cover'`
- **willLoadMoreOptions**: `boolean` - More options available
- **onScrolledToBottom**: `() => void` - Callback when reaching bottom

### Implementation Variations

#### 5.1 Default Combobox
```javascript
function ComboboxExample() {
  const [selectedOption, setSelectedOption] = useState();
  const [inputValue, setInputValue] = useState('');

  const optionsMarkup = options.map((option) => (
    <Listbox.Option
      key={option.value}
      value={option.value}
      selected={selectedOption === option.value}
      accessibilityLabel={option.label}
    >
      {option.label}
    </Listbox.Option>
  ));

  return (
    <Combobox
      activator={
        <Combobox.TextField
          prefix={<Icon source={SearchIcon} />}
          onChange={updateText}
          label="Search tags"
          value={inputValue}
          placeholder="Search tags"
        />
      }
    >
      <Listbox onSelect={updateSelection}>{optionsMarkup}</Listbox>
    </Combobox>
  );
}
```

#### 5.2-5.6 Other Variations
- **Manual Selection**: Allow custom values not in options
- **Multi-Select**: Use `allowMultiple` prop
- **Multi-Select with Manual**: Combine both features
- **Vertical Content**: Custom layout for options
- **Loading**: Show spinner while loading

---

## 6. Date Picker Component

### Import Statement
```javascript
import { DatePicker } from '@shopify/polaris';
```

### Key Props
- **selected** (required): `Range | Date` - Selected date or range
- **month** (required): `number` - Month to show (0-11)
- **year** (required): `number` - Year to show
- **onChange** (required): `(value: Range) => void` - Change handler
- **allowRange**: `boolean` - Allow date range selection
- **multiMonth**: `boolean` - Span multiple months
- **disableDatesBefore**: `Date` - Disable dates before
- **disableDatesAfter**: `Date` - Disable dates after
- **disableSpecificDates**: `Date[]` - Disable specific dates

### Implementation Variations

#### 6.1 Default Date Picker
```javascript
function DefaultDatePicker() {
  const [{ month, year }, setDate] = useState({
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
  });
  
  const [selectedDates, setSelectedDates] = useState({
    start: new Date(),
    end: new Date(),
  });

  const handleMonthChange = useCallback(
    (month, year) => setDate({ month, year }),
    []
  );

  return (
    <DatePicker
      month={month}
      year={year}
      onChange={setSelectedDates}
      onMonthChange={handleMonthChange}
      selected={selectedDates}
    />
  );
}
```

#### 6.2-6.5 Range and Disabled Variations
```javascript
// Ranged
<DatePicker
  allowRange
  selected={selectedDates}
  onChange={setSelectedDates}
/>

// Multi-month Ranged
<DatePicker
  allowRange
  multiMonth
  selected={selectedDates}
  onChange={setSelectedDates}
/>

// Disabled Date Ranges
<DatePicker
  disableDatesBefore={yesterday}
  disableDatesAfter={oneYearFromNow}
  selected={selectedDates}
  onChange={setSelectedDates}
/>

// Specific Disabled Dates
<DatePicker
  disableSpecificDates={weekends}
  selected={selectedDates}
  onChange={setSelectedDates}
/>
```

---

## 7. Drop Zone Component

### Import Statement
```javascript
import { DropZone, LegacyStack, Thumbnail, Text } from '@shopify/polaris';
import { NoteIcon } from '@shopify/polaris-icons';
```

### Key Props
- **onDrop** (required): `(files, acceptedFiles, rejectedFiles) => void`
- **label**: `React.ReactNode` - Label for file input
- **accept**: `string` - Allowed file types
- **type**: `'file' | 'image' | 'video'` - Type of files
- **allowMultiple**: `boolean` - Allow multiple files
- **dropOnPage**: `boolean` - Drop anywhere on page
- **customValidator**: `(file: File) => boolean` - Custom validation

### Implementation Variations

#### 7.1 Default Drop Zone
```javascript
function DropZoneExample() {
  const [files, setFiles] = useState([]);

  const handleDropZoneDrop = useCallback(
    (_dropFiles, acceptedFiles, _rejectedFiles) =>
      setFiles((files) => [...files, ...acceptedFiles]),
    [],
  );

  const fileUpload = !files.length && <DropZone.FileUpload />;

  return (
    <DropZone onDrop={handleDropZoneDrop}>
      {uploadedFiles}
      {fileUpload}
    </DropZone>
  );
}
```

#### 7.2-7.11 Other Variations
```javascript
// With Label
<DropZone label="Upload files" onDrop={handleDropZoneDrop} />

// Image File Upload
<DropZone type="image" accept="image/*" onDrop={handleDropZoneDrop} />

// Single File Upload
<DropZone allowMultiple={false} onDrop={handleDropZoneDrop} />

// Drop on Page
<DropZone dropOnPage onDrop={handleDropZoneDrop} />

// Accepts Only SVG Files
<DropZone accept=".svg,image/svg+xml" onDrop={handleDropZoneDrop} />

// Custom File Upload Text
<DropZone.FileUpload 
  actionTitle="Choose files"
  actionHint="or drag and drop here"
/>
```

---

## 8. Filters Component

### Import Statement
```javascript
import { Filters, ChoiceList, TextField, RangeSlider } from '@shopify/polaris';
```

### Key Props
- **queryValue**: `string` - Search query value
- **filters** (required): `FilterInterface[]` - Filter definitions
- **appliedFilters**: `AppliedFilterInterface[]` - Currently applied filters
- **onQueryChange** (required): `(value: string) => void`
- **onQueryClear** (required): `() => void`
- **onClearAll** (required): `() => void`
- **disabled**: `boolean` - Disable all filters
- **hideQueryField**: `boolean` - Hide search field

### Implementation Variations

#### 8.1 With Resource List
```javascript
const filters = [
  {
    key: 'accountStatus',
    label: 'Account status',
    filter: (
      <ChoiceList
        title="Account status"
        titleHidden
        choices={statusChoices}
        selected={accountStatus}
        onChange={setAccountStatus}
        allowMultiple
      />
    ),
    shortcut: true,
  }
];

<Filters
  queryValue={queryValue}
  filters={filters}
  appliedFilters={appliedFilters}
  onQueryChange={setQueryValue}
  onQueryClear={() => setQueryValue('')}
  onClearAll={handleFiltersClearAll}
/>
```

#### 8.2-8.8 Other Variations
- **With Data Table**: Combine with DataTable component
- **Children Content**: Add custom actions
- **Unsaved Changes**: Include save indicators
- **Disabled**: `disabled={true}`
- **Some Disabled**: `disableFilters={true}`
- **Query Field Hidden**: `hideQueryField={true}`
- **Query Field Disabled**: `disableQueryField={true}`

---

## 9. Form Component

### Import Statement
```javascript
import { Form, FormLayout, TextField, Button } from '@shopify/polaris';
```

### Key Props
- **onSubmit** (required): `(event: FormEvent) => unknown` - Submit handler
- **noValidate**: `boolean` - Disable native validation
- **preventDefault**: `boolean` - Prevent default submission
- **method**: `'post' | 'get' | 'action'` - Form method
- **implicitSubmit**: `boolean` - Enable implicit submission

### Implementation Variations

#### 9.1 Custom onSubmit
```javascript
function FormWithCustomSubmit() {
  const handleSubmit = useCallback(async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    
    try {
      const formData = { email, newsletter };
      await submitFormData(formData);
      resetForm();
    } catch (error) {
      setError(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }, [email, newsletter]);

  return (
    <Form onSubmit={handleSubmit}>
      <FormLayout>
        <TextField
          value={email}
          onChange={setEmail}
          label="Email"
          type="email"
          required
        />
        <Button submit loading={isSubmitting}>
          Submit
        </Button>
      </FormLayout>
    </Form>
  );
}
```

#### 9.2 Without Native Validation
```javascript
<Form 
  onSubmit={handleSubmit}
  noValidate={true}
  preventDefault={true}
>
  {/* Custom validation logic */}
</Form>
```

---

## 10. Index Filters Component

### Import Statement
```javascript
import { IndexFilters, useSetIndexFiltersMode, useIndexResourceState } from '@shopify/polaris';
```

### Key Props
- **mode** (required): `IndexFiltersMode` - Current mode
- **setMode** (required): `(mode: IndexFiltersMode) => void` - Mode setter
- **sortOptions**: `SortOption[]` - Sorting options
- **filters**: `FilterInterface[]` - Filter definitions
- **tabs**: `TabProps[]` - Tab configuration
- **canCreateNewView**: `boolean` - Allow new views

### Implementation Variations

#### 10.1 Default Index Filters
```javascript
function IndexFiltersDefault() {
  const {mode, setMode} = useSetIndexFiltersMode();
  const [queryValue, setQueryValue] = useState('');

  const sortOptions = [
    {label: 'Order', value: 'order asc', directionLabel: 'Ascending'},
    {label: 'Order', value: 'order desc', directionLabel: 'Descending'},
  ];

  return (
    <IndexFilters
      sortOptions={sortOptions}
      queryValue={queryValue}
      onQueryChange={setQueryValue}
      filters={filters}
      mode={mode}
      setMode={setMode}
    />
  );
}
```

#### 10.2-10.6 Other Variations
- **Pinned Filters**: Use `shortcut: true` in filter definition
- **Filtering Mode Default**: Initialize with filtering mode
- **Disabled**: `disabled={true}`
- **No Filters**: Omit `filters` prop
- **No Search or Filters**: Omit both query and filters

---

## 11. Inline Error Component

### Import Statement
```javascript
import { InlineError } from '@shopify/polaris';
```

### Key Props
- **message** (required): `any` - Error message content
- **fieldID** (required): `string` - ID of invalid field

### Implementation
```javascript
function InlineErrorExample() {
  return (
    <>
      <TextField
        id="email"
        label="Email"
        value={email}
        onChange={setEmail}
        error={Boolean(errors.email)}
      />
      {errors.email && (
        <InlineError 
          message={errors.email} 
          fieldID="email" 
        />
      )}
    </>
  );
}
```

---

## 12. Radio Button Component

### Import Statement
```javascript
import { RadioButton, LegacyStack } from '@shopify/polaris';
```

### Key Props
- **label** (required): `React.ReactNode` - Label text
- **checked**: `boolean` - Selection state
- **onChange**: `(newValue: boolean, id: string) => void` - Change handler
- **id**: `string` - Unique identifier
- **name**: `string` - Group name (required for grouping)
- **value**: `string` - Form value
- **helpText**: `React.ReactNode` - Additional help text

### Implementation
```javascript
function RadioButtonGroup() {
  const [value, setValue] = useState('standard');
  
  const handleChange = useCallback(
    (_, newValue) => setValue(newValue),
    [],
  );

  return (
    <LegacyStack vertical>
      <RadioButton
        label="Standard shipping"
        helpText="5-7 business days • Free"
        checked={value === 'standard'}
        id="standard"
        name="shipping"
        onChange={handleChange}
      />
      <RadioButton
        label="Express shipping"
        helpText="2-3 business days • $9.99"
        checked={value === 'express'}
        id="express"
        name="shipping"
        onChange={handleChange}
      />
    </LegacyStack>
  );
}
```

---

## 13. Range Slider Component

### Import Statement
```javascript
import { RangeSlider } from '@shopify/polaris';
```

### Key Props
- **label** (required): `ReactNode` - Label text
- **value** (required): `number | [number, number]` - Current value
- **onChange** (required): `(value: number | [number, number]) => void`
- **min**: `number` - Minimum value (default: 0)
- **max**: `number` - Maximum value (default: 100)
- **step**: `number` - Increment value
- **output**: `boolean` - Show tooltip with value
- **prefix**: `ReactNode` - Prefix element
- **suffix**: `ReactNode` - Suffix element

### Implementation
```javascript
function RangeSliderExample() {
  const [rangeValue, setRangeValue] = useState(50);

  return (
    <RangeSlider
      label="Discount percentage"
      value={rangeValue}
      onChange={setRangeValue}
      min={0}
      max={100}
      step={5}
      output
      suffix="%"
    />
  );
}
```

---

## 14. Select Component

### Import Statement
```javascript
import { Select } from '@shopify/polaris';
```

### Key Props
- **label** (required): `ReactNode` - Label text
- **options** (required): `Option[]` - Select options
- **value**: `string` - Selected value
- **onChange**: `(selected: string, id: string) => void` - Change handler
- **error**: `any` - Error message
- **placeholder**: `string` - Placeholder text
- **disabled**: `boolean` - Disable select

### Implementation Variations

#### 14.1 Default Select
```javascript
function SelectExample() {
  const [selected, setSelected] = useState('today');

  const options = [
    { label: 'Today', value: 'today' },
    { label: 'Yesterday', value: 'yesterday' },
    { label: 'Last 7 days', value: 'lastWeek' },
  ];

  return (
    <Select
      label="Date range"
      options={options}
      onChange={setSelected}
      value={selected}
    />
  );
}
```

#### 14.2 With Error
```javascript
<Select
  label="Required field"
  options={options}
  onChange={handleSelectChange}
  value={selected}
  error="Please select an option"
  requiredIndicator
/>
```

---

## 15. Tag Component

### Import Statement
```javascript
import { Tag } from '@shopify/polaris';
```

### Key Props
- **children** (required): `ReactNode` - Tag content
- **onRemove**: `() => void` - Remove handler (makes tag removable)
- **onClick**: `() => void` - Click handler (makes tag clickable)
- **disabled**: `boolean` - Disable interactions
- **accessibilityLabel**: `string` - Custom accessibility label

### Implementation Variations

#### 15.1 Default Tag
```javascript
<Tag>Wholesale</Tag>
```

#### 15.2 Removable Tag
```javascript
function RemovableTags() {
  const [tags, setTags] = useState(['wholesale', 'retail']);

  const removeTag = useCallback((tagToRemove) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  }, [tags]);

  return (
    <>
      {tags.map((tag) => (
        <Tag
          key={tag}
          onRemove={() => removeTag(tag)}
        >
          {tag}
        </Tag>
      ))}
    </>
  );
}
```

#### 15.3 Clickable Tag
```javascript
<Tag onClick={() => handleTagClick('wholesale')}>
  Wholesale
</Tag>
```

---

## 16. Text Field Component

### Import Statement
```javascript
import { TextField } from '@shopify/polaris';
```

### Key Props
- **label** (required): `string` - Label text
- **value**: `string` - Field value
- **onChange** (required): `(value: string, id?: string) => void`
- **type**: `'text' | 'email' | 'number' | 'password' | 'search' | 'tel' | 'url'`
- **error**: `any` - Error message
- **placeholder**: `string` - Placeholder text
- **clearButton**: `boolean` - Show clear button
- **multiline**: `boolean | number` - Enable multiline
- **maxLength**: `number` - Maximum length
- **showCharacterCount**: `boolean` - Show character counter

### Implementation Variations

#### 16.1 Default Text Field
```javascript
function TextFieldExample() {
  const [value, setValue] = useState('');

  return (
    <TextField
      label="Store name"
      value={value}
      onChange={setValue}
      autoComplete="off"
    />
  );
}
```

#### 16.2 With Clear Button
```javascript
function TextFieldWithClear() {
  const [value, setValue] = useState('');

  return (
    <TextField
      label="Search products"
      value={value}
      onChange={setValue}
      clearButton
      onClearButtonClick={() => setValue('')}
      placeholder="Type to search..."
    />
  );
}
```

---

## RewardsPro-Specific Implementations

### Tier Management Form
```javascript
import { Form, FormLayout, TextField, Select, Button, Banner } from '@shopify/polaris';
import { useState, useCallback } from 'react';

function TierManagementForm() {
  const [formData, setFormData] = useState({
    name: '',
    minSpend: '',
    cashbackPercent: '',
    evaluationPeriod: 'ANNUAL'
  });
  const [errors, setErrors] = useState({});

  const handleSubmit = useCallback(async (event) => {
    event.preventDefault();
    
    // Validate
    const newErrors = {};
    if (!formData.name) newErrors.name = 'Tier name is required';
    if (!formData.minSpend || formData.minSpend < 0) {
      newErrors.minSpend = 'Minimum spend must be positive';
    }
    if (formData.cashbackPercent < 0 || formData.cashbackPercent > 100) {
      newErrors.cashbackPercent = 'Cashback must be between 0-100%';
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    // Submit to API
    try {
      await fetch('/api/tiers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      // Handle success
    } catch (error) {
      // Handle error
    }
  }, [formData]);

  return (
    <Form onSubmit={handleSubmit}>
      <FormLayout>
        <TextField
          label="Tier Name"
          value={formData.name}
          onChange={(value) => setFormData({...formData, name: value})}
          error={errors.name}
          placeholder="e.g., Gold, Platinum"
          requiredIndicator
        />
        
        <TextField
          label="Minimum Spending Threshold"
          type="number"
          value={formData.minSpend}
          onChange={(value) => setFormData({...formData, minSpend: value})}
          error={errors.minSpend}
          prefix="$"
          helpText="Minimum amount customer must spend to qualify"
          requiredIndicator
        />
        
        <TextField
          label="Cashback Percentage"
          type="number"
          value={formData.cashbackPercent}
          onChange={(value) => setFormData({...formData, cashbackPercent: value})}
          error={errors.cashbackPercent}
          suffix="%"
          helpText="Percentage of purchase returned as store credit"
          requiredIndicator
        />
        
        <Select
          label="Evaluation Period"
          options={[
            { label: 'Annual (12 months)', value: 'ANNUAL' },
            { label: 'Lifetime', value: 'LIFETIME' }
          ]}
          value={formData.evaluationPeriod}
          onChange={(value) => setFormData({...formData, evaluationPeriod: value})}
          helpText="How spending is calculated for tier qualification"
        />
        
        <Button submit primary>Create Tier</Button>
      </FormLayout>
    </Form>
  );
}
```

### Customer Search with Filters
```javascript
import { Filters, ChoiceList, RangeSlider, ResourceList, Avatar, Text } from '@shopify/polaris';

function CustomerSearch() {
  const [queryValue, setQueryValue] = useState('');
  const [tierFilter, setTierFilter] = useState([]);
  const [creditRange, setCreditRange] = useState([0, 1000]);
  
  const filters = [
    {
      key: 'tier',
      label: 'Customer Tier',
      filter: (
        <ChoiceList
          title="Customer Tier"
          titleHidden
          choices={[
            { label: 'Bronze', value: 'bronze' },
            { label: 'Silver', value: 'silver' },
            { label: 'Gold', value: 'gold' },
            { label: 'Platinum', value: 'platinum' }
          ]}
          selected={tierFilter}
          onChange={setTierFilter}
          allowMultiple
        />
      ),
      shortcut: true
    },
    {
      key: 'storeCredit',
      label: 'Store Credit Balance',
      filter: (
        <RangeSlider
          label="Credit balance range"
          labelHidden
          value={creditRange}
          prefix="$"
          min={0}
          max={5000}
          step={50}
          onChange={setCreditRange}
        />
      )
    }
  ];
  
  const appliedFilters = [];
  if (tierFilter.length > 0) {
    appliedFilters.push({
      key: 'tier',
      label: `Tier: ${tierFilter.join(', ')}`
    });
  }
  
  return (
    <>
      <Filters
        queryValue={queryValue}
        filters={filters}
        appliedFilters={appliedFilters}
        onQueryChange={setQueryValue}
        onQueryClear={() => setQueryValue('')}
        onClearAll={() => {
          setTierFilter([]);
          setCreditRange([0, 1000]);
        }}
      />
      <ResourceList
        resourceName={{ singular: 'customer', plural: 'customers' }}
        items={filteredCustomers}
        renderItem={(item) => (
          <ResourceList.Item
            id={item.id}
            media={<Avatar customer name={item.name} />}
          >
            <Text variant="bodyMd" fontWeight="bold">
              {item.name}
            </Text>
            <Text variant="bodySm">
              {item.tier} • ${item.storeCredit} credit
            </Text>
          </ResourceList.Item>
        )}
      />
    </>
  );
}
```

### Cashback Settings Form
```javascript
import { Form, FormLayout, Checkbox, DatePicker, Button, Banner } from '@shopify/polaris';

function CashbackSettings() {
  const [settings, setSettings] = useState({
    enabled: true,
    autoApply: false,
    minOrderAmount: '10',
    excludeSaleItems: false,
    excludeShipping: true,
    validFrom: new Date(),
    validTo: null
  });
  
  return (
    <Form onSubmit={handleSubmit}>
      <FormLayout>
        <Banner status="info">
          Configure how cashback rewards are calculated and applied
        </Banner>
        
        <Checkbox
          label="Enable cashback program"
          checked={settings.enabled}
          onChange={(value) => setSettings({...settings, enabled: value})}
        />
        
        <Checkbox
          label="Automatically apply cashback on checkout"
          checked={settings.autoApply}
          onChange={(value) => setSettings({...settings, autoApply: value})}
          helpText="When enabled, cashback is applied without customer action"
        />
        
        <TextField
          label="Minimum order amount"
          type="number"
          value={settings.minOrderAmount}
          onChange={(value) => setSettings({...settings, minOrderAmount: value})}
          prefix="$"
          helpText="Orders below this amount won't earn cashback"
        />
        
        <Checkbox
          label="Exclude sale items from cashback"
          checked={settings.excludeSaleItems}
          onChange={(value) => setSettings({...settings, excludeSaleItems: value})}
        />
        
        <Checkbox
          label="Exclude shipping costs from cashback calculation"
          checked={settings.excludeShipping}
          onChange={(value) => setSettings({...settings, excludeShipping: value})}
        />
        
        <DatePicker
          month={new Date().getMonth()}
          year={new Date().getFullYear()}
          onChange={(value) => setSettings({...settings, validFrom: value.start})}
          selected={settings.validFrom}
        />
        
        <Button submit primary>Save Settings</Button>
      </FormLayout>
    </Form>
  );
}
```

---

## Form Validation Best Practices

### Custom Validation Hook
```javascript
function useFormValidation(initialState, validationRules) {
  const [values, setValues] = useState(initialState);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  const validateField = useCallback((field, value) => {
    const rule = validationRules[field];
    if (!rule) return '';
    
    if (rule.required && !value) {
      return rule.message || `${field} is required`;
    }
    
    if (rule.pattern && !rule.pattern.test(value)) {
      return rule.message || `Invalid ${field}`;
    }
    
    if (rule.min && value < rule.min) {
      return rule.message || `${field} must be at least ${rule.min}`;
    }
    
    if (rule.max && value > rule.max) {
      return rule.message || `${field} must be at most ${rule.max}`;
    }
    
    return '';
  }, [validationRules]);

  const setValue = useCallback((field, value) => {
    setValues(prev => ({ ...prev, [field]: value }));
    if (touched[field]) {
      const error = validateField(field, value);
      setErrors(prev => ({ ...prev, [field]: error }));
    }
  }, [touched, validateField]);

  const setFieldTouched = useCallback((field) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    const error = validateField(field, values[field]);
    setErrors(prev => ({ ...prev, [field]: error }));
  }, [values, validateField]);

  const validateForm = useCallback(() => {
    const newErrors = {};
    let isValid = true;

    Object.keys(validationRules).forEach(field => {
      const error = validateField(field, values[field]);
      if (error) {
        newErrors[field] = error;
        isValid = false;
      }
    });

    setErrors(newErrors);
    setTouched(Object.keys(validationRules).reduce((acc, field) => ({
      ...acc,
      [field]: true
    }), {}));
    
    return isValid;
  }, [values, validationRules, validateField]);

  return { 
    values, 
    errors, 
    touched,
    setValue, 
    setFieldTouched,
    validateForm 
  };
}
```

### Form Submission Pattern
```javascript
const handleSubmit = async (event) => {
  event.preventDefault();
  
  if (!validateForm()) {
    showToast('Please fix the errors in the form');
    return;
  }
  
  setIsSubmitting(true);
  
  try {
    const response = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    
    if (!response.ok) {
      throw new Error('Submission failed');
    }
    
    showToast('Form submitted successfully', 'success');
    resetForm();
  } catch (error) {
    setErrors({ submit: error.message });
    showToast('An error occurred. Please try again.', 'error');
  } finally {
    setIsSubmitting(false);
  }
};
```

---

## Accessibility Considerations

### Universal Features
- **ARIA Support**: All components follow ARIA 1.2 patterns
- **Keyboard Navigation**: Full keyboard support
  - Tab/Shift+Tab for focus navigation
  - Arrow keys for option selection
  - Enter to select/submit
  - Escape to close/cancel
- **Screen Reader Support**: Proper labeling and announcements
- **Focus Management**: Clear focus indicators and logical tab order
- **Error Announcements**: Errors linked via aria-describedby

### Component-Specific Accessibility

#### Forms and Inputs
- Use semantic HTML elements
- Provide clear labels (avoid placeholder-only)
- Associate error messages with fields
- Use fieldset/legend for grouped inputs
- Include skip links for long forms

#### Interactive Elements
- Ensure sufficient color contrast (4.5:1 minimum)
- Provide hover and focus states
- Use appropriate cursor styles
- Include touch targets of at least 44×44 pixels

---

## Performance Optimization

### General Strategies
```javascript
// Memoize expensive computations
const filteredOptions = useMemo(() => {
  return options.filter(option => 
    option.label.toLowerCase().includes(searchTerm.toLowerCase())
  );
}, [options, searchTerm]);

// Use callback for event handlers
const handleChange = useCallback((value) => {
  setValue(value);
}, []);

// Debounce search inputs
const debouncedSearch = useMemo(
  () => debounce(searchAPI, 300),
  []
);
```

### Large Dataset Handling
```javascript
// Virtual scrolling for long lists
function VirtualizedAutocomplete({ items }) {
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });
  
  const handleScroll = useCallback((scrollTop, containerHeight) => {
    const itemHeight = 40;
    const start = Math.floor(scrollTop / itemHeight);
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    setVisibleRange({ start, end: start + visibleCount });
  }, []);
  
  const visibleItems = useMemo(() => 
    items.slice(visibleRange.start, visibleRange.end),
    [items, visibleRange]
  );
  
  return (
    <Autocomplete
      options={visibleItems}
      onScrolledToBottom={loadMore}
      // ... other props
    />
  );
}
```

---

## Important Notes and Tips

### Setup Requirements
1. **AppProvider is mandatory** - Wrap your app with AppProvider
2. **Import CSS** - Include Polaris stylesheet
3. **Locale support** - Import appropriate translations
4. **TypeScript** - Full TypeScript support available

### Common Pitfalls to Avoid
1. **State Management**: Always use controlled components for forms
2. **Performance**: Memoize callbacks and expensive computations
3. **Accessibility**: Never remove labels, use labelHidden if needed
4. **Validation**: Validate on both client and server
5. **Error Handling**: Provide clear, actionable error messages

### Mobile Considerations
- All components are responsive by default
- Touch targets meet minimum size requirements
- Input types optimize mobile keyboards
- Consider thumb reach for important actions

### Browser Support
- Modern browsers (Chrome 60+, Firefox 55+, Safari 12+, Edge 79+)
- Mobile browsers (iOS Safari 12+, Chrome Mobile 60+)
- Graceful degradation for older browsers

This comprehensive guide provides everything needed to implement Shopify Polaris React form and input components effectively in the RewardsPro application.