import { useState, useMemo, useCallback, useRef } from "react";
import {
  Grid,
  createMutableClientDataSource,
  type ColumnDefinition,
} from "gp-grid-react";

interface StockTick {
  id: number;
  symbol: string;
  price: number;
  change: number;
  volume: number;
  timestamp: string;
}

const symbols = [
  "AAPL",
  "GOOGL",
  "MSFT",
  "AMZN",
  "META",
  "TSLA",
  "NVDA",
  "AMD",
];

function getRandomPrice(): number {
  return Math.round((Math.random() * 500 + 50) * 100) / 100;
}

function getRandomChange(): number {
  return Math.round((Math.random() * 10 - 5) * 100) / 100;
}

function getRandomVolume(): number {
  return Math.floor(Math.random() * 1000000) + 10000;
}

let nextId = 1;

function generateTick(): StockTick {
  return {
    id: nextId++,
    symbol: symbols[Math.floor(Math.random() * symbols.length)],
    price: getRandomPrice(),
    change: getRandomChange(),
    volume: getRandomVolume(),
    timestamp: new Date().toISOString().slice(11, 23),
  };
}

function generateInitialData(count: number): StockTick[] {
  return Array.from({ length: count }, () => generateTick());
}

const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 80, headerName: "ID" },
  { field: "symbol", cellDataType: "text", width: 100, headerName: "Symbol" },
  { field: "price", cellDataType: "number", width: 120, headerName: "Price" },
  { field: "change", cellDataType: "number", width: 100, headerName: "Change" },
  { field: "volume", cellDataType: "number", width: 120, headerName: "Volume" },
  { field: "timestamp", cellDataType: "text", width: 140, headerName: "Time" },
];

export function LiveInsertDemo() {
  const [rowCount, setRowCount] = useState(10);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamInterval, setStreamInterval] = useState(100);
  const [batchSize, setBatchSize] = useState(10);
  const streamingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dataSource = useMemo(() => {
    const ds = createMutableClientDataSource<StockTick>(
      generateInitialData(10),
      {
        getRowId: (row) => row.id,
        debounceMs: 50,
        onTransactionProcessed: (result) => {
          setRowCount((prev) => prev + result.added - result.removed);
        },
      },
    );
    return ds;
  }, []);

  const handleAddRow = useCallback(() => {
    dataSource.addRows([generateTick()]);
  }, [dataSource]);

  const handleAddBatch = useCallback(() => {
    const batch = Array.from({ length: batchSize }, () => generateTick());
    dataSource.addRows(batch);
  }, [dataSource, batchSize]);

  const handleRemoveFirst = useCallback(async () => {
    await dataSource.flushTransactions();
    const count = dataSource.getTotalRowCount();
    if (count > 0) {
      const firstId = 1;
      dataSource.removeRows([firstId]);
    }
  }, [dataSource]);

  const handleClearAll = useCallback(async () => {
    await dataSource.flushTransactions();
    const count = dataSource.getTotalRowCount();
    const ids = Array.from({ length: count }, (_, i) => i + 1);
    dataSource.removeRows(ids);
  }, [dataSource]);

  const toggleStreaming = useCallback(() => {
    if (isStreaming) {
      if (streamingRef.current) {
        clearInterval(streamingRef.current);
        streamingRef.current = null;
      }
      setIsStreaming(false);
    } else {
      streamingRef.current = setInterval(() => {
        dataSource.addRows([generateTick()]);
      }, streamInterval);
      setIsStreaming(true);
    }
  }, [isStreaming, streamInterval, dataSource]);

  return (
    <div style={{ padding: "20px" }}>
      <h2 style={{ marginBottom: "16px", color: "#f3f4f6" }}>
        Live Data Insert Demo
      </h2>
      <p style={{ color: "#9ca3af", marginBottom: "20px" }}>
        Demonstrates real-time data mutations using{" "}
        <code>createMutableClientDataSource</code>.
      </p>

      <div
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "16px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <button
          onClick={handleAddRow}
          style={{
            backgroundColor: "#10b981",
            color: "white",
            padding: "8px 16px",
            borderRadius: "6px",
            border: "none",
            cursor: "pointer",
            fontWeight: "500",
          }}
        >
          Add Single Row
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={handleAddBatch}
            style={{
              backgroundColor: "#3b82f6",
              color: "white",
              padding: "8px 16px",
              borderRadius: "6px",
              border: "none",
              cursor: "pointer",
              fontWeight: "500",
            }}
          >
            Add Batch
          </button>
          <input
            type="number"
            value={batchSize}
            onChange={(e) =>
              setBatchSize(Math.max(1, parseInt(e.target.value) || 1))
            }
            style={{
              width: "60px",
              padding: "6px",
              borderRadius: "4px",
              border: "1px solid #4b5563",
              backgroundColor: "#1f2937",
              color: "#f3f4f6",
            }}
          />
          <span style={{ color: "#9ca3af" }}>rows</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={toggleStreaming}
            style={{
              backgroundColor: isStreaming ? "#ef4444" : "#8b5cf6",
              color: "white",
              padding: "8px 16px",
              borderRadius: "6px",
              border: "none",
              cursor: "pointer",
              fontWeight: "500",
            }}
          >
            {isStreaming ? "Stop Stream" : "Start Stream"}
          </button>
          <input
            type="number"
            value={streamInterval}
            onChange={(e) =>
              setStreamInterval(Math.max(10, parseInt(e.target.value) || 100))
            }
            disabled={isStreaming}
            style={{
              width: "70px",
              padding: "6px",
              borderRadius: "4px",
              border: "1px solid #4b5563",
              backgroundColor: isStreaming ? "#374151" : "#1f2937",
              color: "#f3f4f6",
              opacity: isStreaming ? 0.5 : 1,
            }}
          />
          <span style={{ color: "#9ca3af" }}>ms</span>
        </div>

        <button
          onClick={handleRemoveFirst}
          style={{
            backgroundColor: "#f59e0b",
            color: "white",
            padding: "8px 16px",
            borderRadius: "6px",
            border: "none",
            cursor: "pointer",
            fontWeight: "500",
          }}
        >
          Remove First
        </button>

        <button
          onClick={handleClearAll}
          style={{
            backgroundColor: "#ef4444",
            color: "white",
            padding: "8px 16px",
            borderRadius: "6px",
            border: "none",
            cursor: "pointer",
            fontWeight: "500",
          }}
        >
          Clear All
        </button>
      </div>

      <div
        style={{
          backgroundColor: "#1f2937",
          padding: "12px 16px",
          borderRadius: "8px",
          marginBottom: "16px",
          display: "flex",
          gap: "24px",
        }}
      >
        <div>
          <span style={{ color: "#9ca3af" }}>Total Rows: </span>
          <span
            style={{ color: "#10b981", fontWeight: "bold", fontSize: "18px" }}
          >
            {rowCount.toLocaleString()}
          </span>
        </div>
        <div>
          <span style={{ color: "#9ca3af" }}>Debounce: </span>
          <span style={{ color: "#60a5fa" }}>50ms</span>
        </div>
        <div>
          <span style={{ color: "#9ca3af" }}>Stream: </span>
          <span style={{ color: isStreaming ? "#10b981" : "#6b7280" }}>
            {isStreaming ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      <div style={{ width: "800px", height: "400px" }}>
        <Grid<StockTick>
          columns={columns}
          dataSource={dataSource}
          rowHeight={36}
          darkMode={true}
          headerHeight={40}
        />
      </div>
    </div>
  );
}
