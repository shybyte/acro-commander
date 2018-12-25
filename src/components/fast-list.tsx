import {Widgets} from 'blessed';
import React, {Component} from 'react';
import BoxOptions = Widgets.BoxOptions;
import Events = Widgets.Events;
import ListElement = Widgets.ListElement;
import Screen = Widgets.Screen;


interface FastListProps extends BoxOptions {
  items: string[]
  label: string;
  screen: Screen;
  onEnter: () => void;
}

interface FastListState {
  offset: number;
}

export class FastList extends Component<FastListProps, FastListState> {
  state: FastListState = {
    offset: 0,
  }

  listRef = React.createRef<ListElement>();

  constructor(props: FastListProps) {
    super(props);
  }

  get selectedIndex() {
    return (this.listRef.current! as any).selected + this.state.offset;
  }

  componentDidMount(): void {
    const listElement = this.listRef.current!;

    listElement.on('resize', () => {
      this.forceUpdate();
    });

    listElement.on('keypress', (_ch, key: Events.IKeyEventArg) => {
      const height = this.getInnerListHeight();
      const selectedIndex = (listElement as any).selected;
      const offset = this.state.offset;
      if (key.name === 'enter') {
        this.props.onEnter();
      } else if (key.name === 'down') {
        if (selectedIndex === height - 1 && offset < this.props.items.length - this.getInnerListHeight()) {
          const newOffset = offset + 1;
          delete (listElement as any).selected;
          this.setState({offset: newOffset});
          setTimeout(() => {
            listElement.select(this.getInnerListHeight() - 1);
          }, 0)
        } else {
          listElement.down(1);
        }
      } else if (key.name === 'up') {
        if (selectedIndex === 0 && offset > 0) {
          const newOffset = offset - 1;
          delete (listElement as any).selected;
          this.setState({offset: newOffset});
          setTimeout(() => {
            listElement.select(0);
          }, 0)
        } else {
          listElement.up(1);
        }
      }
    });

  }

  get focusElement() {
    return this.listRef.current!;
  }

  focus() {
    this.listRef.current!.focus();
  }

  getInnerListHeight() {
    return (this.listRef.current ? this.listRef.current.height : this.props.screen.height) as number - 2;
  }

  render() {
    return (
      <blessed-list
        {...this.props}
        ref={this.listRef}
        tags={true}
        mouse={true}
        invertSelected={false}
        items={this.props.items.slice(this.state.offset, this.state.offset + this.getInnerListHeight() + 1)}
      >

      </blessed-list>

    );
  }
}
