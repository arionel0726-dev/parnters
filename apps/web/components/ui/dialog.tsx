"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "dialog-mobile-sheet__overlay fixed inset-0 isolate z-50 bg-black/55 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  style,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  const swipeCloseRef = React.useRef<HTMLButtonElement>(null)
  const dragStartYRef = React.useRef<number | null>(null)
  const dragOffsetRef = React.useRef(0)
  const [dragOffset, setDragOffset] = React.useState(0)

  function updateDragOffset(nextOffset: number) {
    dragOffsetRef.current = nextOffset
    setDragOffset(nextOffset)
  }

  function handleHandlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse") return
    dragStartYRef.current = event.clientY
    updateDragOffset(0)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleHandlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (dragStartYRef.current === null) return
    updateDragOffset(Math.max(0, event.clientY - dragStartYRef.current))
  }

  function finishHandleDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (dragStartYRef.current === null) return
    const shouldClose = dragOffsetRef.current >= 88
    dragStartYRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (shouldClose) {
      swipeCloseRef.current?.click()
      return
    }
    updateDragOffset(0)
  }

  function cancelHandleDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (dragStartYRef.current === null) return
    dragStartYRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    updateDragOffset(0)
  }

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "dialog-mobile-sheet app-surface fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        data-dragging={dragOffset > 0 ? "true" : undefined}
        style={{
          ...style,
          "--dialog-drag-offset": `${dragOffset}px`,
        } as React.CSSProperties}
        {...props}
      >
        <div
          className="dialog-mobile-sheet__handle mx-auto mb-[-0.5rem] h-1.5 w-10 rounded-full bg-foreground/15 sm:hidden"
          role="presentation"
          onPointerDown={handleHandlePointerDown}
          onPointerMove={handleHandlePointerMove}
          onPointerUp={finishHandleDrag}
          onPointerCancel={cancelHandleDrag}
        />
        <DialogPrimitive.Close ref={swipeCloseRef} className="sr-only" aria-hidden="true" tabIndex={-1} />
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
