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
  const [isWalletConnected, setIsWalletConnected] = useState(false);

  const connectWallet = async () => {
    try {
      const address = await requestConnectedWalletAddress();
      setUserAddress(address);
      setWalletError(null);
      setIsWalletConnected(true);
    } catch (error) {
      setUserAddress("");
      setWalletError(formatError(error));
      setIsWalletConnected(false);
    }
  };

  const disconnectWallet = () => {
    // MetaMask does not provide a reliable programmatic disconnect for dapps.
    // We clear the local wallet state so the demo requires an explicit reconnect.
    setUserAddress("");
    setWalletError(null);
    setIsWalletConnected(false);
  };

  useEffect(() => {
    const provider = getEthereumProvider();

    const handleAccountsChanged = (accounts: string[]) => {
      const nextAddress = typeof accounts[0] === "string" ? accounts[0].trim() : "";
      setUserAddress(nextAddress);
      setIsWalletConnected(Boolean(nextAddress));
      setWalletError(nextAddress ? null : "MetaMask is connected but no account is available.");
    };

    provider?.on?.("accountsChanged", handleAccountsChanged);

    return () => {
      provider?.removeListener?.("accountsChanged", handleAccountsChanged);
    };
  }, []);

  return {
    userAddress,
    setUserAddress,
    walletError,
    isWalletConnected,
    connectWallet,
    disconnectWallet
  };
}
