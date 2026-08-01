"use client";

import { motion } from "framer-motion";
import type { AgentResult } from "@/data/types";
import AgentAvatar from "./AgentAvatar";

interface AgentPipelineProps {
  state: AgentResult[];
  large?: boolean;
}

export default function AgentPipeline({ state, large = false }: AgentPipelineProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      {state.map((agent, i) => {
        const prevDone = i === 0 || state[i - 1]?.status === "done";

        return (
          <div key={agent.agent} className="flex items-center">
            <AgentAvatar
              agent={agent.agent}
              status={agent.status}
              size={large ? "lg" : "md"}
              showName={large}
            />

            {/* Connector line */}
            {i < state.length - 1 && (
              <div className="relative mx-2 h-0.5 w-12 md:w-20 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-brand-electric to-brand-purple"
                  initial={{ width: "0%" }}
                  animate={{
                    width:
                      agent.status === "done"
                        ? "100%"
                        : agent.status === "thinking"
                        ? "50%"
                        : "0%",
                  }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />

                {/* Moving dot */}
                {agent.status === "thinking" && prevDone && (
                  <motion.div
                    className="absolute top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-brand-electric shadow-glow-blue"
                    animate={{ x: ["0%", "400%"] }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
