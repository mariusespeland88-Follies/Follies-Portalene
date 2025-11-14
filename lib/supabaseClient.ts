"use client";

// Enkel, trygg Supabase-klient som kan brukes i React-komponenter
import { createClientComponentClient } from "@/lib/supabase/browser";

// Bruk uten typer for å unngå ekstra oppsett
export const supabase = createClientComponentClient();
