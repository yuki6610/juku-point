"use client";
import { useState } from "react";

export default function GradeTag({ grade, onChange }) {
  const [open, setOpen] = useState(false);

  const gradeList = [
    { value: 7, label: "中1" },
    { value: 8, label: "中2" },
    { value: 9, label: "中3" },
    { value: 10, label: "高1" },
    { value: 11, label: "高2" },
    { value: 12, label: "高3" },
  ];

  return (
    <>
      <span
        className="grade-tag"
        onClick={() => setOpen(true)}
        style={{
          display: "inline-block",
          background: "#2563eb",
          color: "white",
          padding: "3px 8px",
          borderRadius: "8px",
          fontSize: "12px",
          cursor: "pointer",
        }}
      >
        {grade}
      </span>

      {open && (
        <div
          className="grade-modal-overlay"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div
            className="grade-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              padding: "20px",
              borderRadius: "12px",
              width: "80%",
              maxWidth: "350px",
            }}
          >
            <h3 style={{ marginBottom: "10px" }}>学年を選択</h3>

            {gradeList.map((g) => (
              <button
                key={g.value}
                onClick={() => {
                  // ⭐ onChange があるときだけ実行する！
                  if (typeof onChange === "function") {
                    onChange(g.value);
                  }
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  padding: "10px",
                  marginBottom: "8px",
                  borderRadius: "8px",
                  border: "1px solid #ddd",
                  cursor: "pointer",
                }}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
