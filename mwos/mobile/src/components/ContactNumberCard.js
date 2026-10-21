import React, { useState } from 'react';
import { Text, Linking } from 'react-native';
import { useAuthStore } from '../hooks/useAuthStore';
import { Button, Input, Card, AlertBox } from './ui';

export default function ContactNumberCard() {
  const { user, updateContact, isLoading } = useAuthStore();
  const [phone, setPhone] = useState(null);
  const [notice, setNotice] = useState('');
  const save = async () => {
    const value = (phone ?? user?.phone ?? '').trim();
    if (value && !/^(09\d{9}|\+?639\d{9}|9\d{9})$/.test(value.replace(/[\s()-]/g, ''))) {
      setNotice('Enter a valid Philippine mobile number.');
      return;
    }
    const result = await updateContact(value);
    setNotice(result.success ? 'Contact saved. SMS verification and SMS recovery are not connected yet.' : result.error);
  };
  return (
    <Card patient>
      <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 10 }}>Contact & recovery</Text>
      <Input label="Mobile contact number" value={phone ?? user?.phone ?? ''} onChangeText={setPhone}
        keyboardType="phone-pad" placeholder="0917 123 4567" />
      <Button title="Save contact number" onPress={save} disabled={isLoading} />
      {notice ? <AlertBox type="info" message={notice} /> : null}
      <Text style={{ fontSize: 13, marginVertical: 12 }}>
        Saving a number does not verify it. No SMS code can be sent until the clinic connects its SMS provider.
      </Text>
      <Button title="Google account recovery" variant="secondary"
        onPress={() => Linking.openURL('https://accounts.google.com/signin/recovery')} />
    </Card>
  );
}
