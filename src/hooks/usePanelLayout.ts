import { useState, useEffect } from 'react';

export const usePanelLayout = () => {
  const [leftOpen, setLeftOpen ] = useState(() => {
    const saved = localStorage.getItem('deplyze_left_panel');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [rightOpen, setRightOpen ] = useState(() => {
    const saved = localStorage.getItem('deplyze_right_panel');
    return saved !== null ? JSON.parse(saved) : true;
  });

  useEffect(() => {
    localStorage.setItem('deplyze_left_panel', JSON.stringify(leftOpen));
  }, [leftOpen]);

  useEffect(() => {
    localStorage.setItem('deplyze_right_panel', JSON.stringify(rightOpen));
  }, [rightOpen]);

  const toggleLeft = () => setLeftOpen(!leftOpen);
  const toggleRight = () => setRightOpen(!rightOpen);
  
  const resetLayout = () => {
    setLeftOpen(true);
    setRightOpen(true);
  };

  return {
    leftOpen,
    rightOpen,
    toggleLeft,
    toggleRight,
    resetLayout
  };
};
