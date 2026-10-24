import { bootstrapApplication } from '@angular/platform-browser';
import { provideBrowserGlobalErrorListeners } from '@angular/core';
import { ConformanceApp } from './app/conformance-app';

bootstrapApplication(ConformanceApp, {
  providers: [provideBrowserGlobalErrorListeners()],
}).catch((error) => console.error(error));
