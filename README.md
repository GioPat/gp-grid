# gp-grid 🏁 🏎️

A high-performance, TypeScript-first data grid library designed to handle massive datasets (millions of rows) with ease. Built with a modular architecture that separates core logic from framework implementations.

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Packages](#packages)
- [Quick Start](#quick-start)
- [Donations](#donations)

## Overview

**gp-grid** is built on three core principles:

### 1. Slot-Based Virtual Scrolling

Instead of rendering all rows, the grid maintains a pool of reusable "slots" (DOM containers) that are recycled as users scroll. This approach:

- Renders only visible rows plus a small overscan buffer
- Recycles DOM elements instead of creating/destroying them
- Maintains consistent performance regardless of dataset size

### 2. Instruction-Based Architecture

The core emits declarative **instructions** (commands) that describe what the UI should do, rather than manipulating the DOM directly. This pattern:

- Keeps the core framework-agnostic (works with React, Vue, Svelte, vanilla JS)
- Enables batched updates for optimal rendering performance
- Provides a clean separation between logic and presentation

### 3. DataSource Abstraction

Data fetching is abstracted through a `DataSource` interface, supporting both:

- **Client-side**: All data loaded in memory, with local sorting/filtering
- **Server-side**: Data fetched on-demand from an API with server-side operations

## Key Features

- **Virtual Scrolling**: Efficiently handles millions of rows through slot-based recycling
- **Cell Selection**: Single cell, range selection, Shift+click extend, Ctrl+click toggle
- **Multi-Column Sorting**: Click to sort, Shift+click for multi-column sort
- **Column Filtering**: Built-in filter row with debounced input
- **Cell Editing**: Double-click or press Enter to edit, with custom editor support
- **Fill Handle**: Excel-like drag-to-fill for editable cells
- **Keyboard Navigation**: Arrow keys, Tab, Enter, Escape, Ctrl+A, Ctrl+C
- **Custom Renderers**: Registry-based cell, edit, and header renderers
- **Dark Mode**: Built-in dark theme support
- **TypeScript**: Full type safety with exported types

## Packages

| Package | Description |
| ------- | ----------- |
| [**gp-grid-core**](./packages/core/README.md) | Framework-agnostic core library with virtual scrolling, data sources, and instruction-based architecture |
| [**gp-grid-react**](./packages/react/README.md) | Official React implementation with full feature support |

## Quick Start

### React

```bash
pnpm add gp-grid-react
```

```tsx
import { Grid, type ColumnDefinition } from "gp-grid-react";

const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 80, headerName: "ID" },
  { field: "name", cellDataType: "text", width: 150, headerName: "Name" },
  { field: "email", cellDataType: "text", width: 250, headerName: "Email" },
];

const data = [
  { id: 1, name: "Alice", email: "alice@example.com" },
  { id: 2, name: "Bob", email: "bob@example.com" },
];

function App() {
  return (
    <div style={{ width: "800px", height: "400px" }}>
      <Grid columns={columns} rowData={data} rowHeight={36} />
    </div>
  );
}
```

### Core (for custom framework adapters)

```bash
pnpm add gp-grid-core
```

See the [gp-grid-core README](./packages/core/README.md) for detailed documentation on creating custom framework adapters.

## Donations

Keeping this library requires effort and passion, I'm a full time engineer employed on other project and I'm trying my best to keep this work free! For all the features.

If you think this project helped you achieve your goals, it's hopefully worth a beer! 🍻

<div align="center">

### Paypal

[![Paypal QR Code](./public/images/donazione_paypal.png "Paypal QR Code donation")](https://www.paypal.com/donate/?hosted_button_id=XCNMG6BR4ZMLY)

[https://www.paypal.com/donate/?hosted_button_id=XCNMG6BR4ZMLY](https://www.paypal.com/donate/?hosted_button_id=XCNMG6BR4ZMLY)

### Bitcoin

[![Bitcoin QR Donation](./public/images/bc1qcukwmzver59eyqq442xyzscmxavqjt568kkc9m.png "Bitcoin QR Donation")](bitcoin:bc1qcukwmzver59eyqq442xyzscmxavqjt568kkc9m)

bitcoin:bc1qcukwmzver59eyqq442xyzscmxavqjt568kkc9m

### Lightning Network

[![Lightning Network QR Donation](./public/images/lightning.png "Lightning Network QR Donation")](lnurl1dp68gurn8ghj7ampd3kx2ar0veekzar0wd5xjtnrdakj7tnhv4kxctttdehhwm30d3h82unvwqhhx6rpvanhjetdvfjhyvf4xs0xu5p7)

lnurl1dp68gurn8ghj7ampd3kx2ar0veekzar0wd5xjtnrdakj7tnhv4kxctttdehhwm30d3h82unvwqhhx6rpvanhjetdvfjhyvf4xs0xu5p7

</div>
