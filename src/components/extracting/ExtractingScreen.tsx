"use client";
import React from "react";

export function ExtractingScreen() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-16 fade-in">
      {/* Icon — uses /ectracting.png with wave/sheene motion */}
      <div className="relative w-[84px] h-[76px] flex items-center justify-center extracting-icon-wrap">
        <img
          src="/ectracting.png"
          alt=""
          width={84}
          height={76}
          className="w-full h-full object-contain extracting-icon-img select-none"
          draggable={false}
        />
        <div className="extracting-sheen" aria-hidden="true" />
      </div>

      <h2 className="text-[20px] md:text-[22px] font-bold tracking-tight mt-5 extracting-shimmer-text">
        Extracting...
      </h2>
      <p className="text-[13px] text-[#8A8A8E] mt-1.5">This may take a while</p>
    </div>
  );
}
