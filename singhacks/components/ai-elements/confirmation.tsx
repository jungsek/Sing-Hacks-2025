"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ToolUIPart } from "ai";
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
} from "react";

/**
 * We define our own approval shape instead of trying to derive it from `ToolUIPart`
 * because the current `ai` package using doesn't expose `approval` on that type.
 */
type Approval = {
  approved?: boolean;
  reason?: string;
} | undefined;

type ConfirmationContextValue = {
  approval: Approval;
  state: ToolUIPart["state"];
};

const ConfirmationContext = createContext<ConfirmationContextValue | null>(null);

const useConfirmation = () => {
  const ctx = useContext(ConfirmationContext);
  if (!ctx) {
    throw new Error("Confirmation components must be used within <Confirmation>");
  }
  return ctx;
};

export type ConfirmationProps = ComponentProps<typeof Alert> & {
  approval?: Approval;
  state: ToolUIPart["state"];
};

export const Confirmation = ({
  className,
  approval,
  state,
  ...props
}: ConfirmationProps) => {
  // nothing to show if no approval or we're still in input
  if (!approval || state === "input-streaming" || state === "input-available") {
    return null;
  }

  return (
    <ConfirmationContext.Provider value={{ approval, state }}>
      <Alert className={cn("flex flex-col gap-2", className)} {...props} />
    </ConfirmationContext.Provider>
  );
};

export type ConfirmationTitleProps = ComponentProps<typeof AlertDescription>;

export const ConfirmationTitle = ({
  className,
  ...props
}: ConfirmationTitleProps) => (
  <AlertDescription className={cn("inline", className)} {...props} />
);

export type ConfirmationRequestProps = {
  children?: ReactNode;
};

/**
 * Show while approval is pending:
 * - we have an approval object
 * - but `approved` is still undefined
 */
export const ConfirmationRequest = ({ children }: ConfirmationRequestProps) => {
  const { approval } = useConfirmation();

  const isPending =
    approval !== undefined && typeof approval.approved === "undefined";

  if (!isPending) return null;

  return children;
};

export type ConfirmationAcceptedProps = {
  children?: ReactNode;
};

export const ConfirmationAccepted = ({
  children,
}: ConfirmationAcceptedProps) => {
  const { approval, state } = useConfirmation();

  const isApproved = approval?.approved === true;
  const isOutputState =
    state === "output-available" || state === "output-error";

  if (!isApproved || !isOutputState) return null;

  return children;
};

export type ConfirmationRejectedProps = {
  children?: ReactNode;
};

export const ConfirmationRejected = ({
  children,
}: ConfirmationRejectedProps) => {
  const { approval, state } = useConfirmation();

  const isRejected = approval?.approved === false;
  const isOutputState =
    state === "output-available" || state === "output-error";

  if (!isRejected || !isOutputState) return null;

  return children;
};

export type ConfirmationActionsProps = ComponentProps<"div">;

/**
 * Show Approve / Reject only while pending.
 */
export const ConfirmationActions = ({
  className,
  ...props
}: ConfirmationActionsProps) => {
  const { approval } = useConfirmation();

  const isPending =
    approval !== undefined && typeof approval.approved === "undefined";

  if (!isPending) return null;

  return (
    <div
      className={cn("flex items-center justify-end gap-2 self-end", className)}
      {...props}
    />
  );
};

export type ConfirmationActionProps = ComponentProps<typeof Button>;

export const ConfirmationAction = (props: ConfirmationActionProps) => (
  <Button className="h-8 px-3 text-sm" type="button" {...props} />
);
