import * as TabsPrimitive from '@radix-ui/react-tabs';
import { forwardRef } from 'react';

const Tabs = TabsPrimitive.Root;

const TabsList = forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className = '', ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={`
      inline-flex items-center gap-6
      border-b border-border
      text-text-muted
      ${className}
    `}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className = '', ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={`
      inline-flex items-center justify-center whitespace-nowrap
      pb-3 px-1
      mono-data text-sm font-medium
      ring-offset-bg transition-all
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan focus-visible:ring-offset-2
      disabled:pointer-events-none disabled:opacity-50
      data-[state=active]:text-text-primary
      data-[state=active]:border-b-2 data-[state=active]:border-accent-cyan
      hover:text-text-secondary
      ${className}
    `}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className = '', ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={`
      mt-4
      ring-offset-bg
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan focus-visible:ring-offset-2
      ${className}
    `}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
