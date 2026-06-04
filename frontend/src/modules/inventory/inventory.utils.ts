import React from "react";
import { Star, AlertTriangle, Flag, Info } from "lucide-react";

export const getFlagPriority = (category?: string): number => {
  if (category === "Preferred") return 1;
  if (category === "Warning") return 3;
  if (category === "Critical") return 4;
  return 2;
};

export const renderSupplierNameWithFlag = (
  s: any,
  nameKey: string = "name",
  categoryKey: string = "flag_category",
  onViewNote?: (name: string, note: string) => void
): React.ReactNode => {
  const category = s[categoryKey] || s.flagCategory;
  const name = s[nameKey];
  const notes = s.flag_notes || s.flagNotes;
  return React.createElement(
    "span",
    { className: "flex items-center gap-1.5" },
    category === "Preferred" &&
      React.createElement(Star, {
        size: 14,
        className: "text-yellow-500 fill-yellow-500 flex-shrink-0",
      }),
    category === "Warning" &&
      React.createElement(AlertTriangle, {
        size: 14,
        className: "text-orange-500 flex-shrink-0",
      }),
    category === "Critical" &&
      React.createElement(Flag, {
        size: 14,
        className: "text-red-500 fill-red-500 flex-shrink-0",
      }),
    React.createElement(
      "span",
      {
        className:
          category === "Critical"
            ? "text-red-600 font-semibold"
            : category === "Warning"
            ? "text-orange-600 font-medium"
            : "",
      },
      name
    ),
    notes &&
      React.createElement(
        "button",
        {
          type: "button",
          onClick: (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (onViewNote) onViewNote(name, notes);
            else alert(`Supplier Note for ${name}:\n${notes}`);
          },
          className:
            "text-gray-400 hover:text-cyan-600 focus:outline-none flex-shrink-0 ml-1",
          title: "View Note",
        },
        React.createElement(Info, { size: 14 })
      )
  );
};
