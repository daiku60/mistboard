import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown } from "lucide-react";

function CircleSelect() {
  const [state, setState] = useState({ disabled: true, values: [] });
  useEffect(() => {
    const update = (event) => setState(event.detail);
    window.addEventListener("mistboard:circle-state", update);
    window.dispatchEvent(new Event("mistboard:circle-ready"));
    return () => window.removeEventListener("mistboard:circle-state", update);
  }, []);
  const choose = (values) =>
    window.dispatchEvent(
      new CustomEvent("mistboard:circle-selection", { detail: values }),
    );
  const label = state.values.length
    ? state.values.map((value) => `${value}″`).join(", ")
    : "Circles";
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="circle-select-trigger" disabled={state.disabled}>
          {label}
          <ChevronDown size={14} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="circle-select-menu"
          sideOffset={6}
          align="end"
        >
          <button className="circle-option clear" onClick={() => choose([])}>
            Clear
          </button>
          {Array.from({ length: 20 }, (_, index) => index + 1).map((value) => (
            <button
              className="circle-option"
              key={value}
              onClick={() =>
                choose(
                  state.values.includes(value)
                    ? state.values.filter((item) => item !== value)
                    : [...state.values, value],
                )
              }
            >
              <span>{value}″</span>
              {state.values.includes(value) && <Check size={15} />}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
createRoot(document.querySelector("#circle-control")).render(<CircleSelect />);
