# Emerald Rock Operating System

Emerald Rock OS — Initial Build Brief

Your role and the product

Build the first working version of Emerald Rock OS, a business management web application for a UK construction planning, programme management and project controls consultancy.

I am the business owner and will develop this application iteratively using Lovable. Make sensible implementation choices, explain essential setup in plain English and ask questions only where a decision materially affects the business workflow.

The immediate objective is to manage projects and allocate staff by day. Later releases will connect resource planning to timesheets, approvals and commercial reporting.

Build functioning workflows backed by persistent data. Do not present simulated functionality as complete.

First build scope

Implement only:

Sign-in and user access.

Employee directory.

Client records.

Project records and budgets.

Daily resource planning.

A simple operational overview.

Do not build timesheets, approval workflows, HR, payroll, accounting integrations, contract registers, property management, subscription billing or AI assistants in this iteration.

Do not add empty navigation items for future modules.

Application structure

Use a responsive desktop-first layout with:

Overview

Projects

Resource Planner

People

Clients

Settings

Optimise the resource planner for a laptop or desktop. On smaller screens, provide a usable list view rather than squeezing a wide planning grid onto the screen.

Use British English, GBP, DD/MM/YYYY dates, Monday-start weeks and Europe/London as the default business timezone. Store audit timestamps consistently and display them in the business timezone.

Visual direction

Create a restrained, professional interface suitable for a consultancy director and busy project managers.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/33227cd4-f4b1-569a-b159-ba78dade449c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
