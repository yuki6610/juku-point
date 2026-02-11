"use client";

import { usePathname } from "next/navigation";

export default function ReturnToMypageButton() {
  const pathname = usePathname();

  // ▼ マイページでは非表示
  if (pathname === "/mypage") return null;
    if (pathname === "/login") return null;
   
  return (
    <>
      <button
        onClick={() => (window.location.href = "/mypage")}
        className="return-btn"
      >
        ⬅ マイページへ戻る
      </button>

      <style jsx>{`
        .return-btn {
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: #4f46e5; 
          color: white;
          padding: 12px 20px;
          border: none;
          border-radius: 28px;
          font-size: 14px;
          font-weight: bold;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
          cursor: pointer;
          z-index: 9999;
          transition: all 0.2s ease;
        }

        .return-btn:hover {
          background: #4338ca;
          transform: translateY(-3px);
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
        }

        .return-btn:active {
          transform: translateY(0);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

        @media (max-width: 600px) {
          .return-btn {
            padding: 10px 16px;
            font-size: 13px;
            bottom: 16px;
            right: 16px;
          }
        }
      `}</style>
    </>
  );
}
