# Keka Effective Hours Calculator (v10)

This Manifest V3 browser extension reads **today’s Keka attendance log only**. It adds the completed clock-in/clock-out intervals and determines whether the latest attendance state is currently clocked in or clocked out.

The default target is **7 hours 5 minutes**. The target is configured with two fields: **hours** and **minutes**. The extension does not modify, regularize, submit, or otherwise change Keka attendance data.

## Behavior

When the latest event is a clock-in, the extension includes the current ongoing interval from that clock-in until the present time. It then shows how much longer the user should remain clocked in, along with an approximate completion time.

When the latest event is a clock-out, only completed intervals are counted. The extension shows the additional effective time still required and tells the user to clock in again to continue accumulating time.

When the target has been reached, it shows that the required effective hours for today are complete.

The calculation is:

```text
completed effective time = all completed clock-in/out intervals + current live interval, if clocked in
remaining time = max(0, target − completed effective time)
```

## Installation in Chrome or Edge

Open the browser’s extensions page, enable **Developer mode**, choose **Load unpacked**, and select this directory:

```text
/home/ubuntu/keka-effective-hours-extension
```

Alternatively, extract the provided ZIP first and load the extracted folder. Open or refresh the Keka **Me → Attendance → Attendance Log** page after installation.

## Changing the target

Open the extension popup and enter the target as separate values. For the default target, enter:

```text
Hours:   7
Minutes: 5
```

The same fields are available on the on-page summary card. The setting is stored in the browser extension storage.

## Keka hostname

The manifest currently allows `*.keka.com` and `*.keka.co`. The supplied screenshot uses `novigo.keka.com`, which is covered by that rule. If another Keka hostname is used, add it to the `matches` list in `manifest.json`, reload the unpacked extension, and refresh the page.

## Markup dependency

The parser is based on the supplied Keka HTML structure, including `.attendance-logs-row`, `.d-flex.mt-10`, and the green/red arrow classes used for clock-in and clock-out entries. If Keka changes its frontend markup, the selectors may need to be updated.
