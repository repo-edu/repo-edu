import type * as React from "react"

import { cn } from "../../lib/utils"

interface CardProps extends React.ComponentProps<"div"> {
  size?: "default" | "compact"
}

function Card({ className, size = "default", ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "bg-card text-card-foreground flex flex-col rounded-lg border shadow-sm",
        size === "compact" ? "gap-1 py-1.5" : "gap-6 py-6",
        className,
      )}
      {...props}
    />
  )
}

interface CardHeaderProps extends React.ComponentProps<"div"> {
  size?: "default" | "compact"
}

function CardHeader({
  className,
  size = "default",
  ...props
}: CardHeaderProps) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "grid auto-rows-min grid-rows-[auto_auto] items-start gap-1 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-4",
        size === "compact" ? "px-2" : "px-6",
        className,
      )}
      {...props}
    />
  )
}

interface CardTitleProps extends React.ComponentProps<"div"> {
  size?: "default" | "compact"
}

function CardTitle({ className, size = "default", ...props }: CardTitleProps) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "leading-none font-semibold",
        size === "compact" ? "text-xs" : "",
        className,
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className,
      )}
      {...props}
    />
  )
}

interface CardContentProps extends React.ComponentProps<"div"> {
  size?: "default" | "compact"
}

function CardContent({
  className,
  size = "default",
  ...props
}: CardContentProps) {
  return (
    <div
      data-slot="card-content"
      className={cn(size === "compact" ? "px-2" : "px-6", className)}
      {...props}
    />
  )
}

interface CardFooterProps extends React.ComponentProps<"div"> {
  size?: "default" | "compact"
}

function CardFooter({
  className,
  size = "default",
  ...props
}: CardFooterProps) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center [.border-t]:pt-4",
        size === "compact" ? "px-2" : "px-6",
        className,
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
