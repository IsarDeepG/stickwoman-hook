import { createFileRoute } from "@tanstack/react-router";
import { HookGame } from "@/components/hook-game";

export const Route = createFileRoute("/")({ component: HookGame });
