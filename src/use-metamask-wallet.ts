import { useEffect, useState } from "react";

type EthereumProvider = {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: "accountsChanged", listener: (accounts: string[]) => void): void;
  removeListener?(event: "accountsChanged", listener: (accounts: string[]) => void): void;
};

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  if (typeof error === "object" && error !== null) {
    try {
      return JSON.stringify(error, null, 2);
    } catch {
      return Object.prototype.toString.call(error);
    }
  }
  return String(error);
}

function getEthereumProvider(): EthereumProvider | undefined {
  const maybeEthereum = (window as typeof window & { ethereum?: EthereumProvider }).ethereum;
  return maybeEthereum;
}

async function requestConnectedWalletAddress(): Promise<string> {
  const provider = getEthereumProvider();
  if (!provider) {
    throw new Error("MetaMask is not available in this browser.");
  }

  const accounts = await provider.request({
    method: "eth_requestAccounts"
  });

  if (!Array.isArray(accounts) || typeof accounts[0] !== "string" || accounts[0].trim() === "") {
    throw new Error("MetaMask did not return a wallet address.");
  }

  return accounts[0].trim();
}

export function useMetaMaskWallet() {
  const [userAddress, setUserAddress] = useState("");
  const [walletError, setWalletError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const provider = getEthereumProvider();

    const connectWallet = async () => {
      try {
        const address = await requestConnectedWalletAddress();
        if (!cancelled) {
          setUserAddress(address);
          setWalletError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setUserAddress("");
          setWalletError(formatError(error));
        }
      }
    };

    void connectWallet();

    const handleAccountsChanged = (accounts: string[]) => {
      const nextAddress = typeof accounts[0] === "string" ? accounts[0].trim() : "";
      setUserAddress(nextAddress);
      setWalletError(nextAddress ? null : "MetaMask is connected but no account is available.");
    };

    provider?.on?.("accountsChanged", handleAccountsChanged);

    return () => {
      cancelled = true;
      provider?.removeListener?.("accountsChanged", handleAccountsChanged);
    };
  }, []);

  return {
    userAddress,
    setUserAddress,
    walletError
  };
}
